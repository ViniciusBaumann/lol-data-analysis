"""Verificacoes de consistencia e reconciliacao de dados.

Cada funcao de check retorna um dict no formato:
    {
        "name": str,
        "status": "passed" | "warning" | "failed",
        "message": str,
        "details": dict | list (optional),
    }
"""

from __future__ import annotations

import logging
from typing import Any

from django.db.models import Count, F, Q, Sum

from analytics.models import (
    Match,
    PlayerMatchStats,
    TeamMatchStats,
)

logger = logging.getLogger(__name__)


def _result(
    name: str,
    status: str,
    message: str,
    details: Any = None,
) -> dict:
    r = {"name": name, "status": status, "message": message}
    if details is not None:
        r["details"] = details
    return r


# ---------------------------------------------------------------------------
# 1. Each Match must have exactly 2 TeamMatchStats
# ---------------------------------------------------------------------------
def check_match_team_stats_count() -> dict:
    """Verify every Match has exactly 2 TeamMatchStats records."""
    name = "match_team_stats_count"
    bad = (
        Match.objects.annotate(ts_count=Count("team_stats"))
        .exclude(ts_count=2)
        .values_list("gameid", "ts_count")[:50]
    )
    bad = list(bad)
    if not bad:
        return _result(name, "passed", "Todas as partidas tem exatamente 2 TeamMatchStats.")
    return _result(
        name,
        "failed",
        f"{len(bad)} partida(s) com contagem de TeamMatchStats != 2.",
        details=[{"gameid": gid, "count": c} for gid, c in bad],
    )


# ---------------------------------------------------------------------------
# 2. Each Match should have exactly 10 PlayerMatchStats
# ---------------------------------------------------------------------------
def check_match_player_stats_count() -> dict:
    """Verify every Match has exactly 10 PlayerMatchStats records."""
    name = "match_player_stats_count"
    bad = (
        Match.objects.annotate(ps_count=Count("player_stats"))
        .exclude(ps_count=10)
        .values_list("gameid", "ps_count")[:50]
    )
    bad = list(bad)
    if not bad:
        return _result(name, "passed", "Todas as partidas tem exatamente 10 PlayerMatchStats.")
    # Some games may legitimately have < 10 (remakes, pauses); use warning.
    return _result(
        name,
        "warning",
        f"{len(bad)} partida(s) com contagem de PlayerMatchStats != 10.",
        details=[{"gameid": gid, "count": c} for gid, c in bad],
    )


# ---------------------------------------------------------------------------
# 3. Team kills == sum(player kills) per team per match
# ---------------------------------------------------------------------------
def check_team_kills_consistency() -> dict:
    """Compare team-level kills against the sum of player kills."""
    name = "team_kills_consistency"

    team_stats = (
        TeamMatchStats.objects.values("match_id", "team_id", "kills")
        .order_by("match_id", "team_id")
    )

    mismatches = []
    for ts in team_stats:
        player_kills_sum = (
            PlayerMatchStats.objects.filter(
                match_id=ts["match_id"],
                team_id=ts["team_id"],
            ).aggregate(total=Sum("kills"))["total"]
            or 0
        )
        if ts["kills"] != player_kills_sum:
            mismatches.append({
                "match_id": ts["match_id"],
                "team_id": ts["team_id"],
                "team_kills": ts["kills"],
                "player_kills_sum": player_kills_sum,
                "diff": ts["kills"] - player_kills_sum,
            })
            if len(mismatches) >= 50:
                break

    if not mismatches:
        return _result(name, "passed", "Kills dos times consistentes com soma dos jogadores.")
    return _result(
        name,
        "warning",
        f"{len(mismatches)} inconsistencia(s) entre kills de time e soma de jogadores.",
        details=mismatches,
    )


# ---------------------------------------------------------------------------
# 4. Match.winner consistency with TeamMatchStats.is_winner
# ---------------------------------------------------------------------------
def check_winner_consistency() -> dict:
    """Ensure Match.winner matches the TeamMatchStats is_winner flag."""
    name = "winner_consistency"
    mismatches = []

    matches_with_winner = (
        Match.objects.filter(winner__isnull=False)
        .select_related("winner")
        .prefetch_related("team_stats")
    )

    for match in matches_with_winner[:5000]:
        winners = [ts for ts in match.team_stats.all() if ts.is_winner]
        if len(winners) != 1:
            mismatches.append({
                "gameid": match.gameid,
                "issue": f"Expected 1 is_winner=True, found {len(winners)}",
            })
        elif winners[0].team_id != match.winner_id:
            mismatches.append({
                "gameid": match.gameid,
                "issue": (
                    f"Match.winner={match.winner_id} "
                    f"!= TeamMatchStats.is_winner team={winners[0].team_id}"
                ),
            })
        if len(mismatches) >= 50:
            break

    if not mismatches:
        return _result(name, "passed", "Vencedores consistentes entre Match e TeamMatchStats.")
    return _result(
        name,
        "failed",
        f"{len(mismatches)} inconsistencia(s) de vencedor.",
        details=mismatches,
    )


# ---------------------------------------------------------------------------
# 5. First objective exclusivity per match
# ---------------------------------------------------------------------------
def check_first_objective_exclusivity() -> dict:
    """First blood/dragon/etc should be True for at most 1 team per match."""
    name = "first_objective_exclusivity"
    objective_fields = [
        "first_blood", "first_dragon", "first_herald",
        "first_baron", "first_tower",
    ]
    issues = []

    for field in objective_fields:
        bad = (
            TeamMatchStats.objects.filter(**{field: True})
            .values("match_id")
            .annotate(cnt=Count("id"))
            .filter(cnt__gt=1)
            .values_list("match_id", "cnt")[:20]
        )
        for mid, cnt in bad:
            issues.append({
                "match_id": mid,
                "objective": field,
                "teams_with_first": cnt,
            })

    if not issues:
        return _result(name, "passed", "Objetivos 'first' sao exclusivos por partida.")
    return _result(
        name,
        "warning",
        f"{len(issues)} caso(s) de primeiro objetivo duplicado.",
        details=issues,
    )


# ---------------------------------------------------------------------------
# 6. Gold diff symmetry between sides
# ---------------------------------------------------------------------------
def check_gold_diff_symmetry() -> dict:
    """Blue golddiffat10 should approximately equal -Red golddiffat10."""
    name = "gold_diff_symmetry"
    TOLERANCE = 50  # Allow small rounding differences

    issues = []
    match_ids_checked = set()

    stats = (
        TeamMatchStats.objects.filter(golddiffat10__isnull=False)
        .values("match_id", "side", "golddiffat10", "golddiffat15")
        .order_by("match_id")
    )

    by_match: dict[int, dict] = {}
    for s in stats:
        mid = s["match_id"]
        by_match.setdefault(mid, {})[s["side"]] = s

    for mid, sides in by_match.items():
        if "Blue" not in sides or "Red" not in sides:
            continue
        blue_gd10 = sides["Blue"]["golddiffat10"] or 0
        red_gd10 = sides["Red"]["golddiffat10"] or 0
        if abs(blue_gd10 + red_gd10) > TOLERANCE:
            issues.append({
                "match_id": mid,
                "blue_golddiffat10": blue_gd10,
                "red_golddiffat10": red_gd10,
                "sum": blue_gd10 + red_gd10,
            })
            if len(issues) >= 30:
                break

    if not issues:
        return _result(name, "passed", "Diferenciais de ouro simetricos entre lados.")
    return _result(
        name,
        "warning",
        f"{len(issues)} partida(s) com gold diff assimetrico (tolerancia={TOLERANCE}).",
        details=issues,
    )


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------
ALL_RECONCILIATION_CHECKS = [
    check_match_team_stats_count,
    check_match_player_stats_count,
    check_team_kills_consistency,
    check_winner_consistency,
    check_first_objective_exclusivity,
    check_gold_diff_symmetry,
]


def run_all_reconciliation_checks() -> list[dict]:
    """Execute all reconciliation checks and return results."""
    results = []
    for check_fn in ALL_RECONCILIATION_CHECKS:
        try:
            results.append(check_fn())
        except Exception as exc:
            logger.exception("Reconciliation check %s failed", check_fn.__name__)
            results.append(_result(
                check_fn.__name__,
                "failed",
                f"Erro ao executar: {exc}",
            ))
    return results
