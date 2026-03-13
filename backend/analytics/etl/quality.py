"""Verificacoes de qualidade de dados.

Detecta registros orfaos, anomalias estatisticas, gaps temporais
e integridade dos modelos ML.
"""

from __future__ import annotations

import logging
from datetime import timedelta
from pathlib import Path
from typing import Any

from django.db.models import Count, Max, Q
from django.utils import timezone

from analytics.models import (
    League,
    Match,
    Player,
    PlayerMatchStats,
    Team,
    TeamEloRating,
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
# 1. Orphan players (no team or no match stats)
# ---------------------------------------------------------------------------
def check_orphan_players() -> dict:
    name = "orphan_players"
    no_team = Player.objects.filter(team__isnull=True).count()
    no_stats = (
        Player.objects.annotate(stats_count=Count("match_stats"))
        .filter(stats_count=0)
        .count()
    )
    total = no_team + no_stats
    if total == 0:
        return _result(name, "passed", "Nenhum jogador orfao encontrado.")
    return _result(
        name,
        "warning",
        f"{no_team} jogador(es) sem time, {no_stats} sem estatisticas.",
        details={"without_team": no_team, "without_stats": no_stats},
    )


# ---------------------------------------------------------------------------
# 2. Orphan teams (no matches at all)
# ---------------------------------------------------------------------------
def check_orphan_teams() -> dict:
    name = "orphan_teams"
    orphans = (
        Team.objects.annotate(
            match_count=Count("match_stats"),
        )
        .filter(match_count=0)
        .values_list("name", flat=True)[:20]
    )
    orphans = list(orphans)
    if not orphans:
        return _result(name, "passed", "Todos os times tem pelo menos 1 partida.")
    return _result(
        name,
        "warning",
        f"{len(orphans)} time(s) sem nenhuma partida.",
        details=orphans,
    )


# ---------------------------------------------------------------------------
# 3. Negative stats
# ---------------------------------------------------------------------------
def check_negative_stats() -> dict:
    name = "negative_stats"
    issues = {}

    neg_team = TeamMatchStats.objects.filter(
        Q(kills__lt=0) | Q(deaths__lt=0) | Q(assists__lt=0) | Q(total_gold__lt=0)
    ).count()
    if neg_team:
        issues["team_stats_negative"] = neg_team

    neg_player = PlayerMatchStats.objects.filter(
        Q(kills__lt=0) | Q(deaths__lt=0) | Q(assists__lt=0)
        | Q(total_gold__lt=0) | Q(cs__lt=0) | Q(damage_to_champions__lt=0)
    ).count()
    if neg_player:
        issues["player_stats_negative"] = neg_player

    if not issues:
        return _result(name, "passed", "Nenhuma estatistica negativa encontrada.")
    return _result(
        name,
        "failed",
        f"Encontradas estatisticas negativas: {issues}",
        details=issues,
    )


# ---------------------------------------------------------------------------
# 4. Anomalous KDA (> 100)
# ---------------------------------------------------------------------------
def check_anomalous_kda() -> dict:
    name = "anomalous_kda"
    bad = (
        PlayerMatchStats.objects.filter(kda__gt=100)
        .values_list("player__name", "match__gameid", "kda")[:20]
    )
    bad = list(bad)
    if not bad:
        return _result(name, "passed", "Nenhum KDA anomalo (> 100) encontrado.")
    return _result(
        name,
        "warning",
        f"{len(bad)} registro(s) com KDA > 100.",
        details=[{"player": p, "gameid": g, "kda": k} for p, g, k in bad],
    )


# ---------------------------------------------------------------------------
# 5. Anomalous game length
# ---------------------------------------------------------------------------
def check_anomalous_game_length() -> dict:
    name = "anomalous_game_length"
    too_short = Match.objects.filter(
        game_length__isnull=False, game_length__lt=10,
    ).count()
    too_long = Match.objects.filter(
        game_length__isnull=False, game_length__gt=90,
    ).count()
    no_length = Match.objects.filter(game_length__isnull=True).count()

    issues = {}
    if too_short:
        issues["too_short_lt10min"] = too_short
    if too_long:
        issues["too_long_gt90min"] = too_long
    if no_length:
        issues["missing_game_length"] = no_length

    if not issues:
        return _result(name, "passed", "Duracoes de partida dentro do esperado.")
    status = "warning" if not too_short else "warning"
    return _result(
        name,
        status,
        f"Anomalias de duracao: {issues}",
        details=issues,
    )


# ---------------------------------------------------------------------------
# 6. Matches without date
# ---------------------------------------------------------------------------
def check_matches_without_date() -> dict:
    name = "matches_without_date"
    count = Match.objects.filter(date__isnull=True).count()
    total = Match.objects.count()
    if count == 0:
        return _result(name, "passed", "Todas as partidas tem data.")
    pct = round(count / max(total, 1) * 100, 1)
    return _result(
        name,
        "warning" if pct < 5 else "failed",
        f"{count} partida(s) sem data ({pct}% do total).",
        details={"count": count, "total": total, "percentage": pct},
    )


# ---------------------------------------------------------------------------
# 7. Future matches (date in the future)
# ---------------------------------------------------------------------------
def check_future_matches() -> dict:
    name = "future_matches"
    now = timezone.now()
    count = Match.objects.filter(date__gt=now).count()
    if count == 0:
        return _result(name, "passed", "Nenhuma partida com data no futuro.")
    return _result(
        name,
        "warning",
        f"{count} partida(s) com data no futuro.",
    )


# ---------------------------------------------------------------------------
# 8. Stale leagues (no matches in last 90 days for current year)
# ---------------------------------------------------------------------------
def check_stale_leagues() -> dict:
    name = "stale_leagues"
    now = timezone.now()
    cutoff = now - timedelta(days=90)
    current_year = now.year

    leagues_with_data = (
        League.objects.filter(matches__year=current_year)
        .annotate(latest=Max("matches__date"))
        .filter(latest__lt=cutoff)
        .values_list("name", "latest")[:20]
    )
    leagues_with_data = list(leagues_with_data)
    if not leagues_with_data:
        return _result(name, "passed", "Todas as ligas ativas tem dados recentes.")
    return _result(
        name,
        "warning",
        f"{len(leagues_with_data)} liga(s) sem partidas nos ultimos 90 dias.",
        details=[{"league": n, "latest_match": str(d)} for n, d in leagues_with_data],
    )


# ---------------------------------------------------------------------------
# 9. ELO integrity
# ---------------------------------------------------------------------------
def check_elo_integrity() -> dict:
    name = "elo_integrity"
    issues = []

    # ELO for teams that never played in that league
    elo_entries = TeamEloRating.objects.select_related("team", "league").all()
    for elo in elo_entries[:2000]:
        played = TeamMatchStats.objects.filter(
            team=elo.team,
            match__league=elo.league,
        ).exists()
        if not played:
            issues.append({
                "team": elo.team.name,
                "league": elo.league.name,
                "elo": elo.elo_rating,
            })
            if len(issues) >= 20:
                break

    if not issues:
        return _result(name, "passed", "Integridade ELO OK: todos os ratings correspondem a partidas reais.")
    return _result(
        name,
        "warning",
        f"{len(issues)} rating(s) ELO sem partidas correspondentes na liga.",
        details=issues,
    )


# ---------------------------------------------------------------------------
# 10. ML model freshness
# ---------------------------------------------------------------------------
def check_ml_model_freshness() -> dict:
    name = "ml_model_freshness"
    models_dir = Path("ml_models")

    expected_models = [
        "winner.joblib",
        "total_kills.joblib",
        "total_towers.joblib",
        "total_dragons.joblib",
        "total_barons.joblib",
        "game_time.joblib",
        "draft_winner.joblib",
    ]

    missing = []
    stale = []
    now = timezone.now()

    for model_name in expected_models:
        model_path = models_dir / model_name
        if not model_path.exists():
            missing.append(model_name)
        else:
            import datetime
            mtime = datetime.datetime.fromtimestamp(
                model_path.stat().st_mtime,
                tz=datetime.timezone.utc,
            )
            age_days = (now - mtime).days
            if age_days > 30:
                stale.append({"model": model_name, "age_days": age_days})

    if not missing and not stale:
        return _result(name, "passed", "Todos os modelos ML existem e estao atualizados.")

    details = {}
    if missing:
        details["missing"] = missing
    if stale:
        details["stale_gt30d"] = stale

    status = "failed" if missing else "warning"
    msg_parts = []
    if missing:
        msg_parts.append(f"{len(missing)} modelo(s) ausente(s)")
    if stale:
        msg_parts.append(f"{len(stale)} modelo(s) desatualizado(s) (>30 dias)")
    return _result(name, status, "; ".join(msg_parts) + ".", details=details)


# ---------------------------------------------------------------------------
# 11. Data import log health
# ---------------------------------------------------------------------------
def check_import_health() -> dict:
    """Check if recent imports have been successful."""
    from analytics.models import DataImportLog

    name = "import_health"
    recent = DataImportLog.objects.order_by("-started_at")[:5]
    recent = list(recent)

    if not recent:
        return _result(name, "warning", "Nenhum log de importacao encontrado.")

    latest = recent[0]
    failed_recent = sum(1 for r in recent if r.status == "failed")

    if latest.status == "failed":
        return _result(
            name,
            "failed",
            f"Ultima importacao falhou ({latest.started_at:%Y-%m-%d %H:%M}): {latest.errors[:200]}",
            details={"last_status": latest.status, "failed_in_last_5": failed_recent},
        )

    if failed_recent >= 3:
        return _result(
            name,
            "warning",
            f"{failed_recent}/5 importacoes recentes falharam.",
            details={"failed_in_last_5": failed_recent},
        )

    return _result(
        name,
        "passed",
        f"Importacoes recentes OK. Ultima: {latest.matches_created} partidas criadas.",
    )


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------
ALL_QUALITY_CHECKS = [
    check_orphan_players,
    check_orphan_teams,
    check_negative_stats,
    check_anomalous_kda,
    check_anomalous_game_length,
    check_matches_without_date,
    check_future_matches,
    check_stale_leagues,
    check_elo_integrity,
    check_ml_model_freshness,
    check_import_health,
]


def run_all_quality_checks() -> list[dict]:
    """Execute all data quality checks and return results."""
    results = []
    for check_fn in ALL_QUALITY_CHECKS:
        try:
            results.append(check_fn())
        except Exception as exc:
            logger.exception("Quality check %s failed", check_fn.__name__)
            results.append(_result(
                check_fn.__name__,
                "failed",
                f"Erro ao executar: {exc}",
            ))
    return results
