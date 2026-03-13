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

import pandas as pd
from django.db.models import Count

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

    # Load all TeamMatchStats into a DataFrame
    team_qs = TeamMatchStats.objects.values("match_id", "team_id", "kills")
    df_team = pd.DataFrame.from_records(team_qs, columns=["match_id", "team_id", "kills"])

    if df_team.empty:
        return _result(name, "passed", "Kills dos times consistentes com soma dos jogadores.")

    # Load all PlayerMatchStats into a DataFrame, group by match+team
    player_qs = PlayerMatchStats.objects.values("match_id", "team_id", "kills")
    df_player = pd.DataFrame.from_records(player_qs, columns=["match_id", "team_id", "kills"])

    if df_player.empty:
        player_kills_agg = pd.DataFrame(columns=["match_id", "team_id", "player_kills_sum"])
    else:
        player_kills_agg = (
            df_player
            .groupby(["match_id", "team_id"], as_index=False)["kills"]
            .sum()
            .rename(columns={"kills": "player_kills_sum"})
        )

    # Merge team stats with aggregated player kills
    merged = df_team.merge(
        player_kills_agg,
        on=["match_id", "team_id"],
        how="left",
    )
    merged["player_kills_sum"] = merged["player_kills_sum"].fillna(0).astype(int)

    # Find mismatches vectorized
    merged["diff"] = merged["kills"] - merged["player_kills_sum"]
    bad = merged[merged["diff"] != 0]

    if bad.empty:
        return _result(name, "passed", "Kills dos times consistentes com soma dos jogadores.")

    mismatches = (
        bad.head(50)
        .rename(columns={"kills": "team_kills"})
        [["match_id", "team_id", "team_kills", "player_kills_sum", "diff"]]
        .to_dict("records")
    )

    return _result(
        name,
        "warning",
        f"{len(bad)} inconsistencia(s) entre kills de time e soma de jogadores.",
        details=mismatches,
    )


# ---------------------------------------------------------------------------
# 4. Match.winner consistency with TeamMatchStats.is_winner
# ---------------------------------------------------------------------------
def check_winner_consistency() -> dict:
    """Ensure Match.winner matches the TeamMatchStats is_winner flag."""
    name = "winner_consistency"

    # Load Match data (only matches with a winner)
    match_qs = (
        Match.objects
        .filter(winner__isnull=False)
        .values("id", "gameid", "winner_id")
    )
    df_match = pd.DataFrame.from_records(match_qs, columns=["id", "gameid", "winner_id"])

    if df_match.empty:
        return _result(name, "passed", "Vencedores consistentes entre Match e TeamMatchStats.")

    # Load TeamMatchStats with is_winner flag
    ts_qs = TeamMatchStats.objects.values("match_id", "team_id", "is_winner")
    df_ts = pd.DataFrame.from_records(ts_qs, columns=["match_id", "team_id", "is_winner"])

    if df_ts.empty:
        return _result(name, "passed", "Vencedores consistentes entre Match e TeamMatchStats.")

    # Filter to only is_winner=True records
    df_winners = df_ts[df_ts["is_winner"]].copy()

    # Count how many is_winner=True per match
    winner_counts = (
        df_winners
        .groupby("match_id", as_index=False)
        .agg(winner_count=("is_winner", "size"), ts_winner_team=("team_id", "first"))
    )

    # Merge with match data
    merged = df_match.merge(
        winner_counts,
        left_on="id",
        right_on="match_id",
        how="left",
    )
    merged["winner_count"] = merged["winner_count"].fillna(0).astype(int)

    mismatches = []

    # Case 1: matches where is_winner count != 1
    bad_count = merged[merged["winner_count"] != 1]
    for row in bad_count.head(50).itertuples():
        mismatches.append({
            "gameid": row.gameid,
            "issue": f"Expected 1 is_winner=True, found {row.winner_count}",
        })

    # Case 2: matches where count == 1 but team_id doesn't match winner
    good_count = merged[merged["winner_count"] == 1]
    bad_team = good_count[good_count["winner_id"] != good_count["ts_winner_team"]]
    remaining = 50 - len(mismatches)
    for row in bad_team.head(remaining).itertuples():
        mismatches.append({
            "gameid": row.gameid,
            "issue": (
                f"Match.winner={row.winner_id} "
                f"!= TeamMatchStats.is_winner team={row.ts_winner_team}"
            ),
        })

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

    # Load all relevant data into one DataFrame
    ts_qs = TeamMatchStats.objects.values("match_id", *objective_fields)
    df = pd.DataFrame.from_records(
        ts_qs,
        columns=["match_id", *objective_fields],
    )

    if df.empty:
        return _result(name, "passed", "Objetivos 'first' sao exclusivos por partida.")

    issues = []

    # For each objective field, group by match_id and count True values
    for field in objective_fields:
        counts = (
            df[df[field]]
            .groupby("match_id", as_index=False)
            .size()
        )
        # Matches where more than 1 team has first objective = True
        bad = counts[counts["size"] > 1]
        for row in bad.head(20).itertuples():
            issues.append({
                "match_id": row.match_id,
                "objective": field,
                "teams_with_first": row.size,
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

    # Load all relevant data into a DataFrame
    stats_qs = (
        TeamMatchStats.objects
        .filter(golddiffat10__isnull=False)
        .values("match_id", "side", "golddiffat10")
    )
    df = pd.DataFrame.from_records(stats_qs, columns=["match_id", "side", "golddiffat10"])

    if df.empty:
        return _result(name, "passed", "Diferenciais de ouro simetricos entre lados.")

    # Pivot by match_id and side to get Blue and Red columns
    pivoted = df.pivot_table(
        index="match_id",
        columns="side",
        values="golddiffat10",
        aggfunc="first",
    )

    # Only check matches that have both Blue and Red
    if "Blue" not in pivoted.columns or "Red" not in pivoted.columns:
        return _result(name, "passed", "Diferenciais de ouro simetricos entre lados.")

    both_sides = pivoted.dropna(subset=["Blue", "Red"])
    both_sides = both_sides.fillna(0)

    # Vectorized symmetry check: blue + red should be near 0
    both_sides["sum_gd10"] = both_sides["Blue"] + both_sides["Red"]
    bad = both_sides[both_sides["sum_gd10"].abs() > TOLERANCE]

    if bad.empty:
        return _result(name, "passed", "Diferenciais de ouro simetricos entre lados.")

    issues = []
    for match_id, row in bad.head(30).iterrows():
        issues.append({
            "match_id": match_id,
            "blue_golddiffat10": row["Blue"],
            "red_golddiffat10": row["Red"],
            "sum": row["sum_gd10"],
        })

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
