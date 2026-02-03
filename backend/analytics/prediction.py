"""Feature engineering, model loading, and match prediction for ML-based predictions."""

import os
from pathlib import Path
from collections import defaultdict

import numpy as np
from django.db.models import Avg, Q, Sum, IntegerField
from django.db.models.functions import Cast

ML_MODELS_DIR = Path(__file__).resolve().parent.parent / "ml_models"

_model_cache: dict = {}

# Roster-aware ML constants
POSITIONS = ["top", "jng", "mid", "bot", "sup"]
POSITION_STATS = ["kda", "cs_per_min", "damage_per_min", "gold_per_min", "vision_score"]
ROSTER_CHANGE_THRESHOLD = 2

# =============================================================================
# DEFAULT VALUE CONSTANTS
# =============================================================================
# These constants define default/fallback values used when data is unavailable.
# They represent reasonable priors based on professional League of Legends statistics.

# DEFAULT_WIN_RATE: Prior probability for win rate when no history exists.
# 0.5 represents no advantage (50% chance).
DEFAULT_WIN_RATE = 0.5

# DEFAULT_KDA: Default KDA ratio for players without history.
# 3.0 is approximately the average KDA in professional play.
DEFAULT_KDA = 3.0

# DEFAULT_GAME_DURATION: Average game duration in minutes.
# 30-32 minutes is typical for professional matches.
DEFAULT_GAME_DURATION = 30.0

# DEFAULT_ELO: Starting ELO rating for new teams.
DEFAULT_ELO = 1500.0

# PLAYER_FORM_WINDOW: Number of recent games for player form calculation.
PLAYER_FORM_WINDOW = 10

# MIN_GAMES_FOR_STATS: Minimum games required for reliable statistics.
MIN_GAMES_FOR_STATS = 3

# Import advanced feature functions
from .prediction_features import (
    compute_team_comp_features,
    compute_tournament_features,
    compute_lane_matchup_features,
    parse_patch_to_numeric,
    get_champion_tags,
)


def get_default_team_features() -> dict:
    """Return default team features for new teams or teams with insufficient data.

    These values represent reasonable priors based on global averages from
    professional League of Legends matches.

    Returns:
        Dict of 52 feature values with global average priors.
    """
    # Global average priors based on typical pro match statistics
    features = {
        "win_rate": 0.5,
        "avg_kills": 12.0,
        "avg_deaths": 12.0,
        "avg_towers": 6.0,
        "avg_dragons": 2.5,
        "avg_barons": 0.8,
        "avg_heralds": 0.8,
        "avg_voidgrubs": 3.0,
        "avg_inhibitors": 1.0,
        "first_blood_rate": 0.5,
        "first_tower_rate": 0.5,
        "first_dragon_rate": 0.5,
        "first_herald_rate": 0.5,
        "first_baron_rate": 0.5,
        "avg_golddiffat10": 0.0,
        "avg_golddiffat15": 0.0,
        "avg_xpdiffat10": 0.0,
        "avg_xpdiffat15": 0.0,
        "avg_csdiffat10": 0.0,
        "avg_csdiffat15": 0.0,
        "avg_game_length": 32.0,
        "win_rate_last3": 0.5,
        "win_rate_last5": 0.5,
        "streak": 0,
        "momentum": 0.0,
        "blue_win_rate": 0.5,
        "red_win_rate": 0.5,
    }

    # Default per-position features (neutral values)
    default_pos_stats = {
        "kda": 3.0,
        "cs_per_min": 7.5,
        "damage_per_min": 500.0,
        "gold_per_min": 380.0,
        "vision_score": 25.0,
    }

    for pos in POSITIONS:
        for stat in POSITION_STATS:
            features[f"pos_{pos}_avg_{stat}"] = default_pos_stats.get(stat, 0.0)

    return features


def compute_team_features(team_id: int, n: int = 10, use_fallback: bool = True) -> dict | None:
    """Compute rolling average features for a team based on their last N matches.

    Includes roster-change detection: if 2+ players changed between consecutive
    matches, only post-change matches are used. Also computes per-position
    stats (KDA, CS/min, damage/min, gold/min, vision) for each of the 5 roles.

    Args:
        team_id: The database ID of the team.
        n: Number of recent matches to use for computing averages.
        use_fallback: If True, return default features for new teams instead of None.

    Returns:
        Dict of 52 feature values (27 team + 25 position), or None if
        insufficient data after roster-change truncation and use_fallback is False.
        When use_fallback is True, returns default features for new teams.

    Note:
        For draft predictions, only 14 specific team features are used to match
        the trained model. See TEAM_FEATURE_KEYS in build_draft_features().
    """
    from .models import Match, PlayerMatchStats, TeamMatchStats

    team_stats = (
        TeamMatchStats.objects.filter(team_id=team_id)
        .select_related("match")
        .order_by("-match__date")[:n]
    )
    stats_list = list(team_stats)
    if len(stats_list) < 3:
        return get_default_team_features() if use_fallback else None

    # Reverse to chronological order (oldest first)
    stats_list.reverse()

    # Fetch player stats for these matches
    match_ids = [s.match_id for s in stats_list]
    player_stats_qs = PlayerMatchStats.objects.filter(
        match_id__in=match_ids, team_id=team_id
    ).select_related("player")

    player_stats_by_match: dict[int, list] = {}
    for ps in player_stats_qs:
        player_stats_by_match.setdefault(ps.match_id, []).append(ps)

    # Detect roster changes and find reset index
    reset_idx = 0
    prev_roster: set | None = None
    for i, s in enumerate(stats_list):
        ps_list = player_stats_by_match.get(s.match_id, [])
        current_roster = frozenset(ps.player_id for ps in ps_list)
        if current_roster and prev_roster is not None and prev_roster:
            diff = current_roster.symmetric_difference(prev_roster)
            if len(diff) >= ROSTER_CHANGE_THRESHOLD:
                reset_idx = i
        if current_roster:
            prev_roster = current_roster

    # Truncate to post-change history
    stats_list = stats_list[reset_idx:]
    if len(stats_list) < 3:
        return get_default_team_features() if use_fallback else None

    total = len(stats_list)
    wins = sum(1 for s in stats_list if s.is_winner)

    # Aggregate averages (14 team features)
    avg_kills = sum(s.kills for s in stats_list) / total
    avg_deaths = sum(s.deaths for s in stats_list) / total
    avg_towers = sum(s.towers for s in stats_list) / total
    avg_dragons = sum(s.dragons for s in stats_list) / total
    avg_barons = sum(s.barons for s in stats_list) / total
    avg_inhibitors = sum(s.inhibitors for s in stats_list) / total

    first_blood_rate = sum(1 for s in stats_list if s.first_blood) / total
    first_tower_rate = sum(1 for s in stats_list if s.first_tower) / total
    first_dragon_rate = sum(1 for s in stats_list if s.first_dragon) / total
    first_herald_rate = sum(1 for s in stats_list if s.first_herald) / total

    gd10_vals = [s.golddiffat10 for s in stats_list if s.golddiffat10 is not None]
    gd15_vals = [s.golddiffat15 for s in stats_list if s.golddiffat15 is not None]
    avg_golddiffat10 = sum(gd10_vals) / len(gd10_vals) if gd10_vals else 0.0
    avg_golddiffat15 = sum(gd15_vals) / len(gd15_vals) if gd15_vals else 0.0

    truncated_match_ids = [s.match_id for s in stats_list]
    matches = Match.objects.filter(id__in=truncated_match_ids, game_length__isnull=False)
    game_lengths = list(matches.values_list("game_length", flat=True))
    avg_game_length = sum(game_lengths) / len(game_lengths) if game_lengths else 30.0

    # Recent form
    last3 = stats_list[-3:] if len(stats_list) >= 3 else stats_list
    last5 = stats_list[-5:] if len(stats_list) >= 5 else stats_list
    win_rate_last3 = sum(1 for s in last3 if s.is_winner) / len(last3)
    win_rate_last5 = sum(1 for s in last5 if s.is_winner) / len(last5)

    # Win/loss streak (positive = wins, negative = losses)
    streak = 0
    for s in reversed(stats_list):
        if s.is_winner:
            if streak < 0:
                break
            streak += 1
        else:
            if streak > 0:
                break
            streak -= 1

    # Side-specific win rates
    blue_games = [s for s in stats_list if s.side == "Blue"]
    red_games = [s for s in stats_list if s.side == "Red"]
    blue_win_rate = (
        sum(1 for s in blue_games if s.is_winner) / len(blue_games)
        if blue_games else 0.5
    )
    red_win_rate = (
        sum(1 for s in red_games if s.is_winner) / len(red_games)
        if red_games else 0.5
    )

    # Extended early game features
    xp10_vals = [s.xpdiffat10 for s in stats_list if s.xpdiffat10 is not None]
    xp15_vals = [s.xpdiffat15 for s in stats_list if s.xpdiffat15 is not None]
    cs10_vals = [s.csdiffat10 for s in stats_list if s.csdiffat10 is not None]
    cs15_vals = [s.csdiffat15 for s in stats_list if s.csdiffat15 is not None]
    avg_xpdiffat10 = sum(xp10_vals) / len(xp10_vals) if xp10_vals else 0.0
    avg_xpdiffat15 = sum(xp15_vals) / len(xp15_vals) if xp15_vals else 0.0
    avg_csdiffat10 = sum(cs10_vals) / len(cs10_vals) if cs10_vals else 0.0
    avg_csdiffat15 = sum(cs15_vals) / len(cs15_vals) if cs15_vals else 0.0

    # First baron rate
    first_baron_rate = sum(1 for s in stats_list if s.first_baron) / total

    # Objective control
    avg_heralds = sum(s.heralds for s in stats_list) / total
    avg_voidgrubs = sum(s.voidgrubs for s in stats_list) / total

    # Compute momentum (trend in last 5 games)
    if len(stats_list) >= 5:
        recent_wins = sum(1 for s in stats_list[-5:] if s.is_winner)
        older_wins = sum(1 for s in stats_list[-10:-5] if s.is_winner) if len(stats_list) >= 10 else recent_wins
        momentum = (recent_wins - older_wins) / 5.0
    else:
        momentum = 0.0

    features = {
        "win_rate": wins / total,
        "avg_kills": avg_kills,
        "avg_deaths": avg_deaths,
        "avg_towers": avg_towers,
        "avg_dragons": avg_dragons,
        "avg_barons": avg_barons,
        "avg_heralds": avg_heralds,
        "avg_voidgrubs": avg_voidgrubs,
        "avg_inhibitors": avg_inhibitors,
        "first_blood_rate": first_blood_rate,
        "first_tower_rate": first_tower_rate,
        "first_dragon_rate": first_dragon_rate,
        "first_herald_rate": first_herald_rate,
        "first_baron_rate": first_baron_rate,
        "avg_golddiffat10": avg_golddiffat10,
        "avg_golddiffat15": avg_golddiffat15,
        "avg_xpdiffat10": avg_xpdiffat10,
        "avg_xpdiffat15": avg_xpdiffat15,
        "avg_csdiffat10": avg_csdiffat10,
        "avg_csdiffat15": avg_csdiffat15,
        "avg_game_length": avg_game_length,
        "win_rate_last3": win_rate_last3,
        "win_rate_last5": win_rate_last5,
        "streak": streak,
        "momentum": momentum,
        "blue_win_rate": blue_win_rate,
        "red_win_rate": red_win_rate,
    }

    # Per-position features (25 features: 5 positions × 5 stats)
    pos_accum: dict[str, dict[str, list[float]]] = {
        pos: {stat: [] for stat in POSITION_STATS} for pos in POSITIONS
    }
    for s in stats_list:
        for ps in player_stats_by_match.get(s.match_id, []):
            pos = ps.position.lower()
            if pos in pos_accum:
                pos_accum[pos]["kda"].append(ps.kda or 0.0)
                pos_accum[pos]["cs_per_min"].append(ps.cs_per_min or 0.0)
                pos_accum[pos]["damage_per_min"].append(ps.damage_per_min or 0.0)
                pos_accum[pos]["gold_per_min"].append(ps.gold_per_min or 0.0)
                pos_accum[pos]["vision_score"].append(ps.vision_score or 0.0)

    for pos in POSITIONS:
        for stat in POSITION_STATS:
            vals = pos_accum[pos][stat]
            features[f"pos_{pos}_avg_{stat}"] = sum(vals) / len(vals) if vals else 0.0

    return features


def compute_h2h_features(team1_id: int, team2_id: int) -> dict:
    """Compute head-to-head features between two teams.

    Args:
        team1_id: Database ID of team 1.
        team2_id: Database ID of team 2.

    Returns:
        Dict with h2h features including:
        - win_rate_vs: Team 1's win rate against team 2
        - total_games_vs: Total H2H games played
        - recent_form_vs: Win rate in last 5 H2H games
        - avg_gold_diff_vs: Average gold difference (team1 - team2) at 15 min
        - avg_game_duration_vs: Average game duration in H2H matches
    """
    from .models import Match, TeamMatchStats

    h2h_matches = Match.objects.filter(
        (Q(blue_team_id=team1_id) & Q(red_team_id=team2_id))
        | (Q(blue_team_id=team2_id) & Q(red_team_id=team1_id))
    ).order_by("-date")

    total_h2h = h2h_matches.count()
    if total_h2h == 0:
        return {
            "win_rate_vs": DEFAULT_WIN_RATE,
            "total_games_vs": 0,
            "recent_form_vs": DEFAULT_WIN_RATE,
            "avg_gold_diff_vs": 0,
            "avg_game_duration_vs": DEFAULT_GAME_DURATION,
        }

    t1_wins = h2h_matches.filter(winner_id=team1_id).count()
    win_rate_vs = t1_wins / total_h2h if total_h2h > 0 else DEFAULT_WIN_RATE

    # Recent form: last 5 h2h
    recent_h2h = list(h2h_matches[:5])
    if recent_h2h:
        recent_wins = sum(1 for m in recent_h2h if m.winner_id == team1_id)
        recent_form_vs = recent_wins / len(recent_h2h) if recent_h2h else DEFAULT_WIN_RATE
    else:
        recent_form_vs = DEFAULT_WIN_RATE

    # Average game duration in H2H
    game_lengths = [m.game_length for m in list(h2h_matches[:20]) if m.game_length]
    avg_game_duration = sum(game_lengths) / len(game_lengths) if game_lengths else DEFAULT_GAME_DURATION

    # Compute average gold difference at 15 minutes (team1 perspective)
    # Fetch TeamMatchStats for H2H matches
    h2h_match_ids = list(h2h_matches.values_list("id", flat=True)[:20])
    gold_diffs = []

    for match in h2h_matches[:20]:
        t1_stats = TeamMatchStats.objects.filter(match_id=match.id, team_id=team1_id).first()
        if t1_stats and t1_stats.golddiffat15 is not None:
            gold_diffs.append(t1_stats.golddiffat15)

    avg_gold_diff_vs = sum(gold_diffs) / len(gold_diffs) if gold_diffs else 0

    return {
        "win_rate_vs": win_rate_vs,
        "total_games_vs": total_h2h,
        "recent_form_vs": recent_form_vs,
        "avg_gold_diff_vs": avg_gold_diff_vs,
        "avg_game_duration_vs": avg_game_duration,
    }


def get_team_elo(team_id: int, league_id: int | None = None) -> dict:
    """Fetch the current ELO ratings (global + side) for a team from the database.

    Args:
        team_id: The database ID of the team.
        league_id: Optional league ID to fetch league-specific ELO.

    Returns:
        Dict with 'global', 'blue', and 'red' ELO values.
    """
    from .models import TeamEloRating

    default = {"global": 1500.0, "blue": 1500.0, "red": 1500.0}

    if league_id:
        try:
            elo = TeamEloRating.objects.get(team_id=team_id, league_id=league_id)
            return {"global": elo.elo_rating, "blue": elo.elo_rating_blue, "red": elo.elo_rating_red}
        except TeamEloRating.DoesNotExist:
            pass

    # Fallback: most recent ELO for team in any league
    elo = (
        TeamEloRating.objects
        .filter(team_id=team_id)
        .order_by("-last_match_date")
        .first()
    )
    if elo:
        return {"global": elo.elo_rating, "blue": elo.elo_rating_blue, "red": elo.elo_rating_red}
    return default


def compute_advanced_features(
    team1_id: int,
    team2_id: int,
    is_playoffs: bool = False,
    patch: str = "",
) -> list[float]:
    """Compute advanced features for a matchup prediction.

    Includes:
    - Tournament stage features
    - Team composition features (from recent champions)
    - Lane matchup features
    - Player form features
    - Patch-specific features

    Args:
        team1_id: Database ID of team 1 (blue side).
        team2_id: Database ID of team 2 (red side).
        is_playoffs: Whether this is a playoff match.
        patch: Current patch version.

    Returns:
        List of advanced feature values.
    """
    from .models import Match, PlayerMatchStats, TeamMatchStats

    # Get recent matches for both teams to extract champion and player data
    recent_blue_stats = list(
        PlayerMatchStats.objects.filter(team_id=team1_id)
        .select_related("match", "player")
        .order_by("-match__date")[:50]
    )
    recent_red_stats = list(
        PlayerMatchStats.objects.filter(team_id=team2_id)
        .select_related("match", "player")
        .order_by("-match__date")[:50]
    )

    # Extract recent champions per position
    blue_champions = {}
    red_champions = {}
    blue_player_ids = {}
    red_player_ids = {}

    for ps in recent_blue_stats[:10]:  # Last ~2 games worth
        pos = ps.position.lower()
        if pos in POSITIONS and pos not in blue_champions:
            blue_champions[pos] = ps.champion
            blue_player_ids[pos] = ps.player_id

    for ps in recent_red_stats[:10]:
        pos = ps.position.lower()
        if pos in POSITIONS and pos not in red_champions:
            red_champions[pos] = ps.champion
            red_player_ids[pos] = ps.player_id

    # 1. Tournament features (4)
    tournament_feats = compute_tournament_features(None, is_playoffs)
    tournament_vals = [
        tournament_feats["is_playoffs"],
        tournament_feats["is_finals"],
        tournament_feats["stage_importance"],
        tournament_feats["stage_code"],
    ]

    # 2. Team composition features (32 + 4 diff = 36)
    blue_comp_feats = compute_team_comp_features(blue_champions, "blue")
    red_comp_feats = compute_team_comp_features(red_champions, "red")

    comp_keys = [
        "comp_early_game", "comp_scaling", "comp_teamfight", "comp_splitpush",
        "comp_poke", "comp_engage", "comp_pick", "comp_ap_count", "comp_ad_count",
        "comp_has_tank", "comp_has_engage", "comp_has_hypercarry",
        "comp_has_assassin", "comp_has_peel", "comp_hypercarry_with_peel",
        "comp_engage_with_followup",
    ]

    comp_vals = []
    for key in comp_keys:
        comp_vals.append(blue_comp_feats.get(f"blue_{key}", 0.0))
    for key in comp_keys:
        comp_vals.append(red_comp_feats.get(f"red_{key}", 0.0))

    # Comp differential features
    comp_diff_vals = [
        blue_comp_feats.get("blue_comp_early_game", 0) - red_comp_feats.get("red_comp_early_game", 0),
        blue_comp_feats.get("blue_comp_scaling", 0) - red_comp_feats.get("red_comp_scaling", 0),
        blue_comp_feats.get("blue_comp_teamfight", 0) - red_comp_feats.get("red_comp_teamfight", 0),
        blue_comp_feats.get("blue_comp_engage", 0) - red_comp_feats.get("red_comp_engage", 0),
    ]

    # 3. Lane matchup features (6)
    # Build matchup history from database
    matchup_history = defaultdict(list)

    # Get historical matchups for each lane
    for pos in POSITIONS:
        blue_champ = blue_champions.get(pos, "")
        red_champ = red_champions.get(pos, "")

        if blue_champ and red_champ:
            # Query historical matchups
            if blue_champ < red_champ:
                key = (blue_champ, red_champ, pos)
            else:
                key = (red_champ, blue_champ, pos)

            # Get matches where these champions faced each other in this lane
            matchup_matches = Match.objects.filter(
                player_stats__champion=blue_champ,
                player_stats__position__iexact=pos,
            ).filter(
                player_stats__champion=red_champ,
                player_stats__position__iexact=pos,
            ).distinct()[:20]

            for m in matchup_matches:
                # Determine which side won
                blue_stats = m.player_stats.filter(champion=blue_champ, position__iexact=pos).first()
                if blue_stats:
                    ts = TeamMatchStats.objects.filter(match=m, team_id=blue_stats.team_id).first()
                    if ts:
                        blue_won = ts.is_winner
                        if blue_champ < red_champ:
                            matchup_history[key].append({"winner_is_first": blue_won})
                        else:
                            matchup_history[key].append({"winner_is_first": not blue_won})

    matchup_feats = compute_lane_matchup_features(blue_champions, red_champions, matchup_history)
    matchup_vals = [
        matchup_feats.get("matchup_top_advantage", 0.0),
        matchup_feats.get("matchup_jng_advantage", 0.0),
        matchup_feats.get("matchup_mid_advantage", 0.0),
        matchup_feats.get("matchup_bot_advantage", 0.0),
        matchup_feats.get("matchup_sup_advantage", 0.0),
        matchup_feats.get("matchup_total_advantage", 0.0),
    ]

    # 4. Player form features (23)
    player_form_vals = []

    for pos in POSITIONS:
        blue_pid = blue_player_ids.get(pos)
        if blue_pid:
            p_stats = list(
                PlayerMatchStats.objects.filter(player_id=blue_pid)
                .select_related("match")
                .order_by("-match__date")[:10]
            )
            if len(p_stats) >= 2:
                p_wins = sum(1 for ps in p_stats if TeamMatchStats.objects.filter(
                    match=ps.match, team_id=ps.team_id, is_winner=True
                ).exists())
                p_kda = sum(ps.kda or 0 for ps in p_stats) / len(p_stats)
                player_form_vals.extend([p_wins / len(p_stats), p_kda])
            else:
                player_form_vals.extend([0.5, 3.0])
        else:
            player_form_vals.extend([0.5, 3.0])

    for pos in POSITIONS:
        red_pid = red_player_ids.get(pos)
        if red_pid:
            p_stats = list(
                PlayerMatchStats.objects.filter(player_id=red_pid)
                .select_related("match")
                .order_by("-match__date")[:10]
            )
            if len(p_stats) >= 2:
                p_wins = sum(1 for ps in p_stats if TeamMatchStats.objects.filter(
                    match=ps.match, team_id=ps.team_id, is_winner=True
                ).exists())
                p_kda = sum(ps.kda or 0 for ps in p_stats) / len(p_stats)
                player_form_vals.extend([p_wins / len(p_stats), p_kda])
            else:
                player_form_vals.extend([0.5, 3.0])
        else:
            player_form_vals.extend([0.5, 3.0])

    # Player form aggregates
    blue_form_avg = sum(player_form_vals[i] for i in range(0, 10, 2)) / 5.0
    red_form_avg = sum(player_form_vals[i] for i in range(10, 20, 2)) / 5.0
    player_form_vals.extend([blue_form_avg, red_form_avg, blue_form_avg - red_form_avg])

    # 5. Patch features (4)
    patch_numeric = parse_patch_to_numeric(patch)

    # Get patch-specific champion win rates
    blue_patch_wr = 0.5
    red_patch_wr = 0.5

    if patch:
        # Query champion win rates for this patch
        for side, champions, result_var in [
            ("blue", blue_champions, "blue_patch_wr"),
            ("red", red_champions, "red_patch_wr"),
        ]:
            wr_sum = 0.0
            count = 0
            for pos, champ in champions.items():
                if champ:
                    champ_stats = PlayerMatchStats.objects.filter(
                        champion=champ,
                        position__iexact=pos,
                        match__patch=patch,
                    ).select_related("match")[:50]

                    if len(champ_stats) >= 3:
                        wins = sum(
                            1 for ps in champ_stats
                            if TeamMatchStats.objects.filter(
                                match=ps.match, team_id=ps.team_id, is_winner=True
                            ).exists()
                        )
                        wr_sum += wins / len(champ_stats)
                        count += 1

            if count > 0:
                if side == "blue":
                    blue_patch_wr = wr_sum / count
                else:
                    red_patch_wr = wr_sum / count

    patch_vals = [
        patch_numeric,
        blue_patch_wr,
        red_patch_wr,
        blue_patch_wr - red_patch_wr,
    ]

    # Combine all advanced features
    return tournament_vals + comp_vals + comp_diff_vals + matchup_vals + player_form_vals + patch_vals


def build_matchup_features(
    team1_id: int,
    team2_id: int,
    league_id: int | None = None,
    is_playoffs: bool = False,
    patch: str = "",
) -> np.ndarray | None:
    """Build the full feature vector for a matchup prediction.

    Combines rolling averages from both teams, differential features,
    head-to-head features, per-league ELO (global + side), and advanced features.

    Args:
        team1_id: Database ID of team 1 (blue side).
        team2_id: Database ID of team 2 (red side).
        league_id: Optional league ID for league-specific ELO.
        is_playoffs: Whether this is a playoff match.
        patch: Current patch version.

    Returns:
        numpy array of features, or None if insufficient data.
    """
    f1 = compute_team_features(team1_id)
    f2 = compute_team_features(team2_id)

    if f1 is None or f2 is None:
        return None

    h2h = compute_h2h_features(team1_id, team2_id)

    # 27 team features - must match get_feature_names() and training
    feature_keys = [
        "win_rate", "avg_kills", "avg_deaths", "avg_towers", "avg_dragons",
        "avg_barons", "avg_heralds", "avg_voidgrubs", "avg_inhibitors",
        "first_blood_rate", "first_tower_rate", "first_dragon_rate",
        "first_herald_rate", "first_baron_rate",
        "avg_golddiffat10", "avg_golddiffat15",
        "avg_xpdiffat10", "avg_xpdiffat15", "avg_csdiffat10", "avg_csdiffat15",
        "avg_game_length", "win_rate_last3", "win_rate_last5",
        "streak", "momentum", "blue_win_rate", "red_win_rate",
    ]

    # Team 1 features (27)
    t1_features = [f1[k] for k in feature_keys]
    # Team 2 features (27)
    t2_features = [f2[k] for k in feature_keys]

    # Differential features (team1 - team2) - extended with early game features
    diff_keys = [
        "win_rate", "avg_kills", "avg_towers", "avg_dragons",
        "avg_golddiffat10", "avg_golddiffat15",
        "avg_xpdiffat10", "avg_xpdiffat15",
        "avg_csdiffat10", "avg_csdiffat15",
        "win_rate_last3", "win_rate_last5", "streak", "momentum",
        "first_blood_rate", "first_tower_rate", "first_dragon_rate",
    ]
    diff_features = [f1[k] - f2[k] for k in diff_keys]

    # H2H features - extended
    h2h_features = [
        h2h["win_rate_vs"],
        h2h["total_games_vs"],
        h2h["recent_form_vs"],
        h2h.get("avg_gold_diff_vs", 0),
        h2h.get("avg_game_duration_vs", 30),
    ]

    # ELO features (global + side, 6 features)
    t1_data = get_team_elo(team1_id, league_id)
    t2_data = get_team_elo(team2_id, league_id)
    elo_features = [
        t1_data["global"], t2_data["global"], t1_data["global"] - t2_data["global"],
        t1_data["blue"], t2_data["red"], t1_data["blue"] - t2_data["red"],
    ]

    # Per-position features (25 per team)
    pos_feature_keys = [
        f"pos_{pos}_avg_{stat}" for pos in POSITIONS for stat in POSITION_STATS
    ]
    t1_pos = [f1[k] for k in pos_feature_keys]
    t2_pos = [f2[k] for k in pos_feature_keys]

    # Advanced features (73 features)
    advanced_features = compute_advanced_features(team1_id, team2_id, is_playoffs, patch)

    all_features = (
        t1_features + t2_features + diff_features + h2h_features +
        elo_features + t1_pos + t2_pos + advanced_features
    )
    return np.array(all_features).reshape(1, -1)


def get_feature_names() -> list[str]:
    """Return the ordered list of feature names matching build_matchup_features output."""
    feature_keys = [
        "win_rate", "avg_kills", "avg_deaths", "avg_towers", "avg_dragons",
        "avg_barons", "avg_heralds", "avg_voidgrubs", "avg_inhibitors",
        "first_blood_rate", "first_tower_rate", "first_dragon_rate",
        "first_herald_rate", "first_baron_rate",
        "avg_golddiffat10", "avg_golddiffat15",
        "avg_xpdiffat10", "avg_xpdiffat15", "avg_csdiffat10", "avg_csdiffat15",
        "avg_game_length", "win_rate_last3", "win_rate_last5",
        "streak", "momentum", "blue_win_rate", "red_win_rate",
    ]

    names = []
    for prefix in ("t1_", "t2_"):
        for k in feature_keys:
            names.append(f"{prefix}{k}")

    diff_keys = [
        "win_rate", "avg_kills", "avg_towers", "avg_dragons",
        "avg_golddiffat10", "avg_golddiffat15",
        "avg_xpdiffat10", "avg_xpdiffat15", "avg_csdiffat10", "avg_csdiffat15",
        "win_rate_last3", "win_rate_last5", "streak", "momentum",
        "first_blood_rate", "first_tower_rate", "first_dragon_rate",
    ]
    for k in diff_keys:
        names.append(f"diff_{k}")

    names.extend([
        "h2h_win_rate_vs", "h2h_total_games_vs", "h2h_recent_form_vs",
        "h2h_avg_gold_diff_vs", "h2h_avg_game_duration_vs"
    ])

    # ELO features (global + side)
    names.extend(["t1_elo", "t2_elo", "diff_elo", "t1_elo_side", "t2_elo_side", "diff_elo_side"])

    # Per-position features (25 per team, 50 total)
    for prefix in ("t1_", "t2_"):
        for pos in POSITIONS:
            for stat in POSITION_STATS:
                names.append(f"{prefix}pos_{pos}_avg_{stat}")

    # Advanced features (73 total)

    # Tournament features (4)
    names.extend([
        "tournament_is_playoffs", "tournament_is_finals",
        "tournament_stage_importance", "tournament_stage_code"
    ])

    # Composition features (32 = 16 per team)
    comp_keys = [
        "comp_early_game", "comp_scaling", "comp_teamfight", "comp_splitpush",
        "comp_poke", "comp_engage", "comp_pick", "comp_ap_count", "comp_ad_count",
        "comp_has_tank", "comp_has_engage", "comp_has_hypercarry",
        "comp_has_assassin", "comp_has_peel", "comp_hypercarry_with_peel",
        "comp_engage_with_followup",
    ]
    for prefix in ("blue_", "red_"):
        for key in comp_keys:
            names.append(f"{prefix}{key}")

    # Composition diff features (4)
    names.extend([
        "comp_diff_early_game", "comp_diff_scaling",
        "comp_diff_teamfight", "comp_diff_engage"
    ])

    # Lane matchup features (6)
    for pos in POSITIONS:
        names.append(f"matchup_{pos}_advantage")
    names.append("matchup_total_advantage")

    # Player form features (23 = 10 blue + 10 red + 3 aggregates)
    for prefix in ("blue_", "red_"):
        for pos in POSITIONS:
            names.append(f"{prefix}player_{pos}_form_wr")
            names.append(f"{prefix}player_{pos}_form_kda")
    names.extend(["blue_form_avg", "red_form_avg", "form_diff"])

    # Patch features (4)
    names.extend([
        "patch_numeric", "blue_avg_patch_wr",
        "red_avg_patch_wr", "patch_wr_diff"
    ])

    return names


def load_model(target_name: str, expected_features: int | None = None):
    """Load a trained model from disk, using a cache to avoid repeated I/O.

    Args:
        target_name: Model name (e.g., 'winner', 'total_kills').
        expected_features: Optional expected number of features. If provided,
            logs a warning if the model was trained with a different count.

    Returns:
        Loaded model object, or None if file not found.
    """
    import logging

    logger = logging.getLogger(__name__)

    if target_name in _model_cache:
        return _model_cache[target_name]

    model_path = ML_MODELS_DIR / f"{target_name}.joblib"
    if not model_path.exists():
        return None

    import joblib

    model = joblib.load(model_path)

    # Validate feature count if model supports n_features_in_
    model_n_features = getattr(model, 'n_features_in_', None)

    # For calibrated classifiers, check the base estimator
    if model_n_features is None and hasattr(model, 'estimator'):
        model_n_features = getattr(model.estimator, 'n_features_in_', None)
    if model_n_features is None and hasattr(model, 'calibrated_classifiers_'):
        # CalibratedClassifierCV stores base estimators in calibrated_classifiers_
        if model.calibrated_classifiers_:
            base = model.calibrated_classifiers_[0]
            if hasattr(base, 'estimator'):
                model_n_features = getattr(base.estimator, 'n_features_in_', None)

    if model_n_features is not None:
        logger.debug(f"Model '{target_name}' expects {model_n_features} features.")

        if expected_features is not None and model_n_features != expected_features:
            logger.warning(
                f"Feature count mismatch for model '{target_name}': "
                f"model expects {model_n_features} features, "
                f"but {expected_features} features will be provided. "
                f"Consider retraining the model."
            )

    _model_cache[target_name] = model
    return model


def clear_model_cache():
    """Clear the in-memory model cache (useful after retraining)."""
    _model_cache.clear()


def compute_champion_aggregate_stats(champion: str, position: str) -> dict | None:
    """Aggregate historical stats for a champion in a given position.

    Args:
        champion: Champion name (e.g., 'Ahri').
        position: Role (top, jng, mid, bot, sup).

    Returns:
        Dict with aggregated stats, or None if fewer than 3 games found.
    """
    from .models import PlayerMatchStats, TeamMatchStats

    qs = PlayerMatchStats.objects.filter(
        champion=champion,
        position__iexact=position,
    )

    total = qs.count()
    if total < 3:
        return None

    agg = qs.aggregate(
        avg_kda=Avg("kda"),
        avg_kills=Avg("kills"),
        avg_deaths=Avg("deaths"),
        avg_gold_per_min=Avg("gold_per_min"),
        avg_damage_per_min=Avg("damage_per_min"),
        avg_cs_per_min=Avg("cs_per_min"),
    )

    # Compute win rate by checking TeamMatchStats for each appearance
    match_team_pairs = list(qs.values_list("match_id", "team_id"))
    match_ids = [mt[0] for mt in match_team_pairs]
    team_ids = [mt[1] for mt in match_team_pairs]

    # Bulk fetch relevant TeamMatchStats
    ts_qs = TeamMatchStats.objects.filter(
        match_id__in=match_ids, is_winner=True
    ).values_list("match_id", "team_id")
    winner_set = set((mid, tid) for mid, tid in ts_qs)

    wins = sum(1 for mt in match_team_pairs if (mt[0], mt[1]) in winner_set)

    return {
        "win_rate": wins / total if total > 0 else 0.0,
        "avg_kda": agg["avg_kda"] or 0.0,
        "avg_kills": float(agg["avg_kills"] or 0),
        "avg_deaths": float(agg["avg_deaths"] or 0),
        "avg_gold_per_min": agg["avg_gold_per_min"] or 0.0,
        "avg_damage_per_min": agg["avg_damage_per_min"] or 0.0,
        "avg_cs_per_min": agg["avg_cs_per_min"] or 0.0,
        "games_played": float(total),
    }


def build_draft_features(
    draft: dict,
    blue_team_id: int | None = None,
    red_team_id: int | None = None,
    player_ids: dict | None = None,
    patch: str = "",
    is_playoffs: bool = False,
) -> np.ndarray | None:
    """Build feature vector from a 10-champion draft + optional team context.

    Returns 80 champion features + 20 player-champion features + 132 team-context
    features + 73 advanced features = 305 total features. When player_ids or team IDs
    are not provided, pads with zeros so the vector size always matches the trained model.

    Feature breakdown:
    - 80 champion features (8 per slot x 10 slots)
    - 20 player-champion features (2 per slot x 10 slots)
    - 132 team context features (27x2 team + 17 diff + 5 h2h + 6 elo + 25x2 position)
    - 73 advanced features (4 tournament + 32 comp + 4 comp_diff + 6 matchup + 23 player_form + 4 patch)

    Args:
        draft: Dict with keys like 'blue_top' ... 'red_sup'.
        blue_team_id: Optional database ID of the blue-side team.
        red_team_id: Optional database ID of the red-side team.
        player_ids: Optional dict with keys like 'blue_top_player_id' ... 'red_sup_player_id'.
        patch: Current patch version for patch-specific champion stats.
        is_playoffs: Whether this is a playoff match (affects tournament features).

    Returns:
        numpy array of shape (1, 305), or None if any champion lacks data.
    """
    positions = ["top", "jng", "mid", "bot", "sup"]
    features: list[float] = []

    # 80 champion features
    for side in ["blue", "red"]:
        for pos in positions:
            champion = draft[f"{side}_{pos}"]
            stats = compute_champion_aggregate_stats(champion, pos)
            if stats is None:
                return None
            features.extend([
                stats["win_rate"],
                stats["avg_kda"],
                stats["avg_kills"],
                stats["avg_deaths"],
                stats["avg_gold_per_min"],
                stats["avg_damage_per_min"],
                stats["avg_cs_per_min"],
                stats["games_played"],
            ])

    # 20 player-champion features (2 per slot: win_rate, games_played)
    # This is the strongest predictor per IEEE research
    NUM_PLAYER_CHAMP_FEATURES = 20
    player_champ_features: list[float] = []

    if player_ids is not None:
        from analytics.models import PlayerMatchStats, TeamMatchStats
        for side in ["blue", "red"]:
            for pos in positions:
                player_key = f"{side}_{pos}_player_id"
                player_id = player_ids.get(player_key)
                champion = draft[f"{side}_{pos}"]

                if player_id:
                    # Get player's history with this champion
                    pc_stats = list(PlayerMatchStats.objects.filter(
                        player_id=player_id, champion=champion
                    ).select_related("match").values("match_id", "team_id"))
                    pc_count = len(pc_stats)

                    if pc_count > 0:
                        # FIXED: Properly correlate match_id and team_id pairs
                        # This ensures we count wins only for the exact team the player was on
                        wins = 0
                        for pc in pc_stats:
                            if TeamMatchStats.objects.filter(
                                match_id=pc["match_id"],
                                team_id=pc["team_id"],
                                is_winner=True
                            ).exists():
                                wins += 1
                        pc_wr = wins / pc_count if pc_count > 0 else DEFAULT_WIN_RATE
                        player_champ_features.extend([pc_wr, float(pc_count)])
                    else:
                        player_champ_features.extend([DEFAULT_WIN_RATE, 0.0])
                else:
                    player_champ_features.extend([DEFAULT_WIN_RATE, 0.0])
    else:
        # No player data available, use defaults
        player_champ_features = [DEFAULT_WIN_RATE, 0.0] * 10  # 10 slots × 2 features = 20

    features.extend(player_champ_features)

    # 132 team-context features (must match train_draft_model.py)
    # Training uses 27 team features per side from _compute_features_from_history
    NUM_TEAM_FEATURES = 132
    TEAM_FEATURE_KEYS = [
        "win_rate", "avg_kills", "avg_deaths", "avg_towers", "avg_dragons",
        "avg_barons", "avg_heralds", "avg_voidgrubs", "avg_inhibitors",
        "first_blood_rate", "first_tower_rate", "first_dragon_rate",
        "first_herald_rate", "first_baron_rate",
        "avg_golddiffat10", "avg_golddiffat15",
        "avg_xpdiffat10", "avg_xpdiffat15", "avg_csdiffat10", "avg_csdiffat15",
        "avg_game_length", "win_rate_last3", "win_rate_last5",
        "streak", "momentum", "blue_win_rate", "red_win_rate",
    ]  # 27 features to match train_draft_model.py
    team_ctx: list[float] | None = None

    if blue_team_id is not None and red_team_id is not None:
        f1 = compute_team_features(blue_team_id)
        f2 = compute_team_features(red_team_id)

        if f1 is not None and f2 is not None:
            h2h = compute_h2h_features(blue_team_id, red_team_id)

            # Use all 27 features the model was trained with
            t1_vals = [f1.get(k, 0.0) for k in TEAM_FEATURE_KEYS]
            t2_vals = [f2.get(k, 0.0) for k in TEAM_FEATURE_KEYS]

            # diff_keys must match train_draft_model.py (17 features)
            diff_keys = [
                "win_rate", "avg_kills", "avg_towers", "avg_dragons",
                "avg_golddiffat10", "avg_golddiffat15",
                "avg_xpdiffat10", "avg_xpdiffat15",
                "avg_csdiffat10", "avg_csdiffat15",
                "win_rate_last3", "win_rate_last5", "streak", "momentum",
                "first_blood_rate", "first_tower_rate", "first_dragon_rate",
            ]
            diff_vals = [f1.get(k, 0) - f2.get(k, 0) for k in diff_keys]

            # h2h must match train_draft_model.py (5 features)
            h2h_vals = [
                h2h["win_rate_vs"],
                h2h["total_games_vs"],
                h2h["recent_form_vs"],
                h2h.get("avg_gold_diff_vs", 0),
                h2h.get("avg_game_duration_vs", 30),
            ]

            t1_elo = get_team_elo(blue_team_id)
            t2_elo = get_team_elo(red_team_id)
            elo_vals = [
                t1_elo["global"], t2_elo["global"], t1_elo["global"] - t2_elo["global"],
                t1_elo["blue"], t2_elo["red"], t1_elo["blue"] - t2_elo["red"],
            ]

            pos_feature_keys = [
                f"pos_{pos}_avg_{stat}" for pos in POSITIONS for stat in POSITION_STATS
            ]
            t1_pos = [f1.get(k, 0) for k in pos_feature_keys]
            t2_pos = [f2.get(k, 0) for k in pos_feature_keys]

            team_ctx = t1_vals + t2_vals + diff_vals + h2h_vals + elo_vals + t1_pos + t2_pos

    if team_ctx is None:
        team_ctx = [0.0] * NUM_TEAM_FEATURES

    features.extend(team_ctx)

    # === ADVANCED FEATURES (73 total) - must match train_draft_model.py ===
    # Breakdown: 4 tournament + 32 comp + 4 comp_diff + 6 matchup + 23 player_form + 4 patch
    from .prediction_features import compute_team_comp_features

    # Extract champions from draft
    blue_champions = {
        "top": draft.get("blue_top", ""),
        "jng": draft.get("blue_jng", ""),
        "mid": draft.get("blue_mid", ""),
        "bot": draft.get("blue_bot", ""),
        "sup": draft.get("blue_sup", ""),
    }
    red_champions = {
        "top": draft.get("red_top", ""),
        "jng": draft.get("red_jng", ""),
        "mid": draft.get("red_mid", ""),
        "bot": draft.get("red_bot", ""),
        "sup": draft.get("red_sup", ""),
    }

    # 1. Tournament features (4) - computed from is_playoffs parameter
    # Training uses: is_playoffs, is_finals, stage_importance, stage_code
    tournament_vals = [
        1.0 if is_playoffs else 0.0,  # is_playoffs
        0.0,  # is_finals (would need more context)
        0.5 if is_playoffs else 0.3,  # stage_importance (higher for playoffs)
        1 if is_playoffs else 0,  # stage_code
    ]

    # 2. Composition features (32 = 16 per team)
    blue_comp_feats = compute_team_comp_features(blue_champions, "blue")
    red_comp_feats = compute_team_comp_features(red_champions, "red")

    comp_keys = [
        "comp_early_game", "comp_scaling", "comp_teamfight", "comp_splitpush",
        "comp_poke", "comp_engage", "comp_pick", "comp_ap_count", "comp_ad_count",
        "comp_has_tank", "comp_has_engage", "comp_has_hypercarry",
        "comp_has_assassin", "comp_has_peel", "comp_hypercarry_with_peel",
        "comp_engage_with_followup",
    ]
    comp_vals = []
    for key in comp_keys:
        comp_vals.append(blue_comp_feats.get(f"blue_{key}", 0.0))
    for key in comp_keys:
        comp_vals.append(red_comp_feats.get(f"red_{key}", 0.0))

    # 3. Comp diff features (4)
    comp_diff_vals = [
        blue_comp_feats.get("blue_comp_early_game", 0) - red_comp_feats.get("red_comp_early_game", 0),
        blue_comp_feats.get("blue_comp_scaling", 0) - red_comp_feats.get("red_comp_scaling", 0),
        blue_comp_feats.get("blue_comp_teamfight", 0) - red_comp_feats.get("red_comp_teamfight", 0),
        blue_comp_feats.get("blue_comp_engage", 0) - red_comp_feats.get("red_comp_engage", 0),
    ]

    # 4. Lane matchup features (6) - computed from historical matchup data
    # Build matchup history from database for each lane
    from analytics.models import Match, TeamMatchStats as MatchupTSModel
    matchup_history: dict[tuple, list] = defaultdict(list)

    for pos in positions:
        blue_champ = blue_champions.get(pos, "")
        red_champ = red_champions.get(pos, "")

        if blue_champ and red_champ:
            # Normalize key (alphabetical order for consistent lookup)
            if blue_champ < red_champ:
                key = (blue_champ, red_champ, pos)
                blue_is_first = True
            else:
                key = (red_champ, blue_champ, pos)
                blue_is_first = False

            # Query historical matchups for this lane
            from analytics.models import PlayerMatchStats as MatchupPMS
            matchup_matches = Match.objects.filter(
                player_stats__champion=blue_champ,
                player_stats__position__iexact=pos,
            ).filter(
                player_stats__champion=red_champ,
                player_stats__position__iexact=pos,
            ).distinct().order_by("-date")[:30]

            for m in matchup_matches:
                # Find which side had the blue champion
                blue_stats = MatchupPMS.objects.filter(
                    match=m, champion=blue_champ, position__iexact=pos
                ).first()
                if blue_stats:
                    ts = MatchupTSModel.objects.filter(
                        match=m, team_id=blue_stats.team_id
                    ).first()
                    if ts:
                        blue_won = ts.is_winner
                        if blue_is_first:
                            matchup_history[key].append({"winner_is_first": blue_won})
                        else:
                            matchup_history[key].append({"winner_is_first": not blue_won})

    # Compute lane matchup features using the accumulated history
    matchup_feats = compute_lane_matchup_features(blue_champions, red_champions, matchup_history)
    matchup_vals = [
        matchup_feats.get("matchup_top_advantage", 0.0),
        matchup_feats.get("matchup_jng_advantage", 0.0),
        matchup_feats.get("matchup_mid_advantage", 0.0),
        matchup_feats.get("matchup_bot_advantage", 0.0),
        matchup_feats.get("matchup_sup_advantage", 0.0),
        matchup_feats.get("matchup_total_advantage", 0.0),
    ]

    # 5. Player form features (23) - computed from player_ids if provided
    from analytics.models import PlayerMatchStats, TeamMatchStats as TSModel

    player_form_vals = []

    if player_ids is not None:
        # Blue player form features (10 = 5 positions x 2 features)
        for pos in positions:
            player_key = f"blue_{pos}_player_id"
            player_id = player_ids.get(player_key)
            if player_id:
                p_stats = list(
                    PlayerMatchStats.objects.filter(player_id=player_id)
                    .select_related("match")
                    .order_by("-match__date")[:PLAYER_FORM_WINDOW]
                )
                if len(p_stats) >= 2:
                    p_wins = sum(1 for ps in p_stats if TSModel.objects.filter(
                        match=ps.match, team_id=ps.team_id, is_winner=True
                    ).exists())
                    # L-6 FIX: Safe division with fallback
                    p_wr = p_wins / len(p_stats) if len(p_stats) > 0 else DEFAULT_WIN_RATE
                    p_kda = sum(ps.kda or 0 for ps in p_stats) / len(p_stats) if len(p_stats) > 0 else DEFAULT_KDA
                    player_form_vals.extend([p_wr, p_kda])
                else:
                    player_form_vals.extend([DEFAULT_WIN_RATE, DEFAULT_KDA])
            else:
                player_form_vals.extend([DEFAULT_WIN_RATE, DEFAULT_KDA])

        # Red player form features (10 = 5 positions x 2 features)
        for pos in positions:
            player_key = f"red_{pos}_player_id"
            player_id = player_ids.get(player_key)
            if player_id:
                p_stats = list(
                    PlayerMatchStats.objects.filter(player_id=player_id)
                    .select_related("match")
                    .order_by("-match__date")[:PLAYER_FORM_WINDOW]
                )
                if len(p_stats) >= 2:
                    p_wins = sum(1 for ps in p_stats if TSModel.objects.filter(
                        match=ps.match, team_id=ps.team_id, is_winner=True
                    ).exists())
                    # L-6 FIX: Safe division with fallback
                    p_wr = p_wins / len(p_stats) if len(p_stats) > 0 else DEFAULT_WIN_RATE
                    p_kda = sum(ps.kda or 0 for ps in p_stats) / len(p_stats) if len(p_stats) > 0 else DEFAULT_KDA
                    player_form_vals.extend([p_wr, p_kda])
                else:
                    player_form_vals.extend([DEFAULT_WIN_RATE, DEFAULT_KDA])
            else:
                player_form_vals.extend([DEFAULT_WIN_RATE, DEFAULT_KDA])
    else:
        # No player data available, use defaults (20 = 10 positions x 2 features)
        player_form_vals = [DEFAULT_WIN_RATE, DEFAULT_KDA] * 10

    # Player form aggregates (3 features)
    blue_form_avg = sum(player_form_vals[i] for i in range(0, 10, 2)) / 5.0
    red_form_avg = sum(player_form_vals[i] for i in range(10, 20, 2)) / 5.0
    player_form_vals.extend([blue_form_avg, red_form_avg, blue_form_avg - red_form_avg])

    # 6. Patch features (4) - computed from patch parameter when provided
    patch_numeric = parse_patch_to_numeric(patch) if patch else 0.0

    # Compute average patch win rate for each team's champions
    blue_patch_wr = DEFAULT_WIN_RATE
    red_patch_wr = DEFAULT_WIN_RATE

    if patch:
        blue_patch_wr_sum = 0.0
        red_patch_wr_sum = 0.0
        blue_patch_count = 0
        red_patch_count = 0

        for pos, champ in blue_champions.items():
            if champ:
                champ_stats = PlayerMatchStats.objects.filter(
                    champion=champ,
                    position__iexact=pos,
                    match__patch=patch,
                ).select_related("match")[:50]

                if len(champ_stats) >= MIN_GAMES_FOR_STATS:
                    wins = sum(
                        1 for ps in champ_stats
                        if TSModel.objects.filter(
                            match=ps.match, team_id=ps.team_id, is_winner=True
                        ).exists()
                    )
                    blue_patch_wr_sum += wins / len(champ_stats) if champ_stats else DEFAULT_WIN_RATE
                    blue_patch_count += 1

        for pos, champ in red_champions.items():
            if champ:
                champ_stats = PlayerMatchStats.objects.filter(
                    champion=champ,
                    position__iexact=pos,
                    match__patch=patch,
                ).select_related("match")[:50]

                if len(champ_stats) >= MIN_GAMES_FOR_STATS:
                    wins = sum(
                        1 for ps in champ_stats
                        if TSModel.objects.filter(
                            match=ps.match, team_id=ps.team_id, is_winner=True
                        ).exists()
                    )
                    red_patch_wr_sum += wins / len(champ_stats) if champ_stats else DEFAULT_WIN_RATE
                    red_patch_count += 1

        blue_patch_wr = blue_patch_wr_sum / blue_patch_count if blue_patch_count > 0 else DEFAULT_WIN_RATE
        red_patch_wr = red_patch_wr_sum / red_patch_count if red_patch_count > 0 else DEFAULT_WIN_RATE

    patch_vals = [
        patch_numeric,
        blue_patch_wr,
        red_patch_wr,
        blue_patch_wr - red_patch_wr,
    ]

    # Combine advanced features (4 + 32 + 4 + 6 + 23 + 4 = 73)
    advanced_features = tournament_vals + comp_vals + comp_diff_vals + matchup_vals + player_form_vals + patch_vals
    features.extend(advanced_features)

    return np.array(features).reshape(1, -1)


def predict_draft(
    draft: dict,
    blue_team_id: int | None = None,
    red_team_id: int | None = None,
    player_ids: dict | None = None,
    patch: str = "",
    is_playoffs: bool = False,
) -> dict:
    """Predict match stats from a 10-champion draft + optional team context.

    Args:
        draft: Dict with keys 'blue_top' through 'red_sup'.
        blue_team_id: Optional blue-side team ID for team-context features.
        red_team_id: Optional red-side team ID for team-context features.
        player_ids: Optional dict with player IDs for player-champion features.
        patch: Current patch version for patch-specific champion stats.
        is_playoffs: Whether this is a playoff match (affects tournament features).

    Returns:
        Dict with predictions or error information.
    """
    from .prediction_features import compute_team_comp_features

    # Compute composition features for both sides
    blue_champions = {
        "top": draft.get("blue_top", ""),
        "jng": draft.get("blue_jng", ""),
        "mid": draft.get("blue_mid", ""),
        "bot": draft.get("blue_bot", ""),
        "sup": draft.get("blue_sup", ""),
    }
    red_champions = {
        "top": draft.get("red_top", ""),
        "jng": draft.get("red_jng", ""),
        "mid": draft.get("red_mid", ""),
        "bot": draft.get("red_bot", ""),
        "sup": draft.get("red_sup", ""),
    }

    blue_comp_features = compute_team_comp_features(blue_champions, "blue")
    red_comp_features = compute_team_comp_features(red_champions, "red")

    # Build composition dict for display (always returned, independent of ML)
    composition = {
        "blue": {
            "early_game": round(blue_comp_features.get("blue_comp_early_game", 0), 2),
            "scaling": round(blue_comp_features.get("blue_comp_scaling", 0), 2),
            "teamfight": round(blue_comp_features.get("blue_comp_teamfight", 0), 2),
            "splitpush": round(blue_comp_features.get("blue_comp_splitpush", 0), 2),
            "poke": round(blue_comp_features.get("blue_comp_poke", 0), 2),
            "engage": round(blue_comp_features.get("blue_comp_engage", 0), 2),
            "pick": round(blue_comp_features.get("blue_comp_pick", 0), 2),
            "siege": round(blue_comp_features.get("blue_comp_siege", 0), 2),
            "ap_count": int(blue_comp_features.get("blue_comp_ap_count", 0)),
            "ad_count": int(blue_comp_features.get("blue_comp_ad_count", 0)),
        },
        "red": {
            "early_game": round(red_comp_features.get("red_comp_early_game", 0), 2),
            "scaling": round(red_comp_features.get("red_comp_scaling", 0), 2),
            "teamfight": round(red_comp_features.get("red_comp_teamfight", 0), 2),
            "splitpush": round(red_comp_features.get("red_comp_splitpush", 0), 2),
            "poke": round(red_comp_features.get("red_comp_poke", 0), 2),
            "engage": round(red_comp_features.get("red_comp_engage", 0), 2),
            "pick": round(red_comp_features.get("red_comp_pick", 0), 2),
            "siege": round(red_comp_features.get("red_comp_siege", 0), 2),
            "ap_count": int(red_comp_features.get("red_comp_ap_count", 0)),
            "ad_count": int(red_comp_features.get("red_comp_ad_count", 0)),
        },
    }

    features = build_draft_features(
        draft, blue_team_id, red_team_id,
        player_ids=player_ids,
        patch=patch,
        is_playoffs=is_playoffs,
    )
    if features is None:
        return {
            "predictions": None,
            "composition": composition,
            "features_available": False,
            "models_loaded": False,
            "message": "One or more champions lack sufficient data (minimum 3 games in that position).",
        }

    has_teams = blue_team_id is not None and red_team_id is not None

    model_names = [
        "draft_winner",
        "draft_total_kills",
        "draft_total_towers",
        "draft_total_dragons",
        "draft_total_barons",
    ]
    models = {}
    all_loaded = True
    for name in model_names:
        m = load_model(name)
        if m is None:
            all_loaded = False
        models[name] = m

    if not all_loaded:
        return {
            "predictions": None,
            "composition": composition,
            "features_available": True,
            "models_loaded": False,
            "message": "Draft models not trained. Run: python manage.py train_draft_model",
        }

    # Win probability
    win_probs = models["draft_winner"].predict_proba(features)[0]
    blue_win_prob = round(float(win_probs[1]) * 100, 1)
    red_win_prob = round(float(win_probs[0]) * 100, 1)

    total_kills = round(float(models["draft_total_kills"].predict(features)[0]), 1)
    total_towers = round(float(models["draft_total_towers"].predict(features)[0]), 1)
    total_dragons = round(float(models["draft_total_dragons"].predict(features)[0]), 1)
    total_barons = round(float(models["draft_total_barons"].predict(features)[0]), 1)

    # Clamp to reasonable ranges
    total_kills = max(0, total_kills)
    total_towers = max(0, min(22, total_towers))
    total_dragons = max(0, min(12, total_dragons))
    total_barons = max(0, min(6, total_barons))

    # Prediction ranges (based on historical standard deviations)
    kills_range = (max(0, round(total_kills - 6)), round(total_kills + 6))
    towers_range = (max(0, round(total_towers - 2)), min(22, round(total_towers + 2)))
    dragons_range = (max(0, round(total_dragons - 1)), min(12, round(total_dragons + 1)))
    barons_range = (max(0, round(total_barons - 1)), min(6, round(total_barons + 1)))

    return {
        "predictions": {
            "blue_win_prob": blue_win_prob,
            "red_win_prob": red_win_prob,
            "total_kills": total_kills,
            "total_towers": total_towers,
            "total_dragons": total_dragons,
            "total_barons": total_barons,
            "kills_range": kills_range,
            "towers_range": towers_range,
            "dragons_range": dragons_range,
            "barons_range": barons_range,
        },
        "composition": composition,
        "features_available": True,
        "models_loaded": True,
        "teams_provided": has_teams,
    }


def predict_match(
    team1_id: int,
    team2_id: int,
    league_id: int | None = None,
    is_playoffs: bool = False,
    patch: str = "",
) -> dict:
    """Predict the outcome of a match between two teams.

    Args:
        team1_id: Database ID of team 1 (blue side).
        team2_id: Database ID of team 2 (red side).
        league_id: Optional league ID for league-specific ELO.
        is_playoffs: Whether this is a playoff match.
        patch: Current patch version.

    Returns:
        Dict with prediction results and metadata.
    """
    from .models import Team

    try:
        team1 = Team.objects.get(pk=team1_id)
        team2 = Team.objects.get(pk=team2_id)
    except Team.DoesNotExist:
        return {"error": "Team not found", "predictions": None}

    team1_info = {
        "id": team1.id,
        "name": team1.name,
        "short_name": team1.short_name or team1.name,
    }
    team2_info = {
        "id": team2.id,
        "name": team2.name,
        "short_name": team2.short_name or team2.name,
    }

    features = build_matchup_features(
        team1_id, team2_id,
        league_id=league_id,
        is_playoffs=is_playoffs,
        patch=patch,
    )
    if features is None:
        return {
            "team1_info": team1_info,
            "team2_info": team2_info,
            "predictions": None,
            "features_available": False,
            "models_loaded": False,
            "message": "Not enough match data for one or both teams.",
        }

    model_names = ["winner", "total_kills", "total_dragons", "total_towers", "total_barons", "game_time"]
    models = {}
    all_loaded = True
    for name in model_names:
        m = load_model(name)
        if m is None:
            all_loaded = False
        models[name] = m

    if not all_loaded:
        return {
            "team1_info": team1_info,
            "team2_info": team2_info,
            "predictions": None,
            "features_available": True,
            "models_loaded": False,
            "message": "Models not trained. Run: python manage.py train_prediction_model",
        }

    # Make predictions
    winner_model = models["winner"]
    win_prob = winner_model.predict_proba(features)[0]
    # Index 1 = team1 wins probability
    team1_win_prob = round(float(win_prob[1]) * 100, 1)
    team2_win_prob = round(100.0 - team1_win_prob, 1)

    total_kills = round(float(models["total_kills"].predict(features)[0]), 1)
    total_dragons = round(float(models["total_dragons"].predict(features)[0]), 1)
    total_towers = round(float(models["total_towers"].predict(features)[0]), 1)
    total_barons = round(float(models["total_barons"].predict(features)[0]), 1)
    game_time = round(float(models["game_time"].predict(features)[0]), 1)

    # Clamp to reasonable ranges
    total_kills = max(0, total_kills)
    total_dragons = max(0, min(12, total_dragons))
    total_towers = max(0, min(22, total_towers))
    total_barons = max(0, min(6, total_barons))
    game_time = max(15, min(80, game_time))

    # Prediction ranges (based on historical standard deviations)
    kills_range = (max(0, round(total_kills - 6)), round(total_kills + 6))
    towers_range = (max(0, round(total_towers - 2)), min(22, round(total_towers + 2)))
    dragons_range = (max(0, round(total_dragons - 1)), min(12, round(total_dragons + 1)))
    barons_range = (max(0, round(total_barons - 1)), min(6, round(total_barons + 1)))
    game_time_range = (max(15, round(game_time - 5)), min(80, round(game_time + 5)))

    return {
        "team1_info": team1_info,
        "team2_info": team2_info,
        "predictions": {
            "team1_win_prob": team1_win_prob,
            "team2_win_prob": team2_win_prob,
            "total_kills": total_kills,
            "total_dragons": total_dragons,
            "total_towers": total_towers,
            "total_barons": total_barons,
            "game_time": game_time,
            "kills_range": kills_range,
            "towers_range": towers_range,
            "dragons_range": dragons_range,
            "barons_range": barons_range,
            "game_time_range": game_time_range,
        },
        "features_available": True,
        "models_loaded": True,
    }
