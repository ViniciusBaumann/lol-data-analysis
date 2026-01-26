"""Feature engineering, model loading, and match prediction for ML-based predictions."""

import os
from pathlib import Path

import numpy as np
from django.db.models import Avg, Q, Sum, IntegerField
from django.db.models.functions import Cast

ML_MODELS_DIR = Path(__file__).resolve().parent.parent / "ml_models"

_model_cache: dict = {}

# Roster-aware ML constants
POSITIONS = ["top", "jng", "mid", "bot", "sup"]
POSITION_STATS = ["kda", "cs_per_min", "damage_per_min", "gold_per_min", "vision_score"]
ROSTER_CHANGE_THRESHOLD = 2


def compute_team_features(team_id: int, n: int = 10) -> dict | None:
    """Compute rolling average features for a team based on their last N matches.

    Includes roster-change detection: if 2+ players changed between consecutive
    matches, only post-change matches are used. Also computes per-position
    stats (KDA, CS/min, damage/min, gold/min, vision) for each of the 5 roles.

    Args:
        team_id: The database ID of the team.
        n: Number of recent matches to use for computing averages.

    Returns:
        Dict of 39 feature values (14 team + 25 position), or None if
        insufficient data after roster-change truncation.
    """
    from .models import Match, PlayerMatchStats, TeamMatchStats

    team_stats = (
        TeamMatchStats.objects.filter(team_id=team_id)
        .select_related("match")
        .order_by("-match__date")[:n]
    )
    stats_list = list(team_stats)
    if len(stats_list) < 3:
        return None

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
        return None

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

    features = {
        "win_rate": wins / total,
        "avg_kills": avg_kills,
        "avg_deaths": avg_deaths,
        "avg_towers": avg_towers,
        "avg_dragons": avg_dragons,
        "avg_barons": avg_barons,
        "avg_inhibitors": avg_inhibitors,
        "first_blood_rate": first_blood_rate,
        "first_tower_rate": first_tower_rate,
        "first_dragon_rate": first_dragon_rate,
        "first_herald_rate": first_herald_rate,
        "avg_golddiffat10": avg_golddiffat10,
        "avg_golddiffat15": avg_golddiffat15,
        "avg_game_length": avg_game_length,
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
        Dict with h2h features.
    """
    from .models import Match

    h2h_matches = Match.objects.filter(
        (Q(blue_team_id=team1_id) & Q(red_team_id=team2_id))
        | (Q(blue_team_id=team2_id) & Q(red_team_id=team1_id))
    ).order_by("-date")

    total_h2h = h2h_matches.count()
    if total_h2h == 0:
        return {
            "win_rate_vs": 0.5,
            "total_games_vs": 0,
            "recent_form_vs": 0.5,
        }

    t1_wins = h2h_matches.filter(winner_id=team1_id).count()
    win_rate_vs = t1_wins / total_h2h

    # Recent form: last 5 h2h
    recent_h2h = list(h2h_matches[:5])
    if recent_h2h:
        recent_wins = sum(1 for m in recent_h2h if m.winner_id == team1_id)
        recent_form_vs = recent_wins / len(recent_h2h)
    else:
        recent_form_vs = 0.5

    return {
        "win_rate_vs": win_rate_vs,
        "total_games_vs": total_h2h,
        "recent_form_vs": recent_form_vs,
    }


def build_matchup_features(team1_id: int, team2_id: int) -> np.ndarray | None:
    """Build the full feature vector for a matchup prediction.

    Combines rolling averages from both teams, differential features,
    and head-to-head features.

    Args:
        team1_id: Database ID of team 1.
        team2_id: Database ID of team 2.

    Returns:
        numpy array of features, or None if insufficient data.
    """
    f1 = compute_team_features(team1_id)
    f2 = compute_team_features(team2_id)

    if f1 is None or f2 is None:
        return None

    h2h = compute_h2h_features(team1_id, team2_id)

    feature_keys = [
        "win_rate", "avg_kills", "avg_deaths", "avg_towers", "avg_dragons",
        "avg_barons", "avg_inhibitors", "first_blood_rate", "first_tower_rate",
        "first_dragon_rate", "first_herald_rate", "avg_golddiffat10",
        "avg_golddiffat15", "avg_game_length",
    ]

    # Team 1 features
    t1_features = [f1[k] for k in feature_keys]
    # Team 2 features
    t2_features = [f2[k] for k in feature_keys]

    # Differential features (team1 - team2)
    diff_keys = [
        "win_rate", "avg_kills", "avg_towers", "avg_dragons",
        "avg_golddiffat10", "avg_golddiffat15",
    ]
    diff_features = [f1[k] - f2[k] for k in diff_keys]

    # H2H features
    h2h_features = [h2h["win_rate_vs"], h2h["total_games_vs"], h2h["recent_form_vs"]]

    # Per-position features (25 per team)
    pos_feature_keys = [
        f"pos_{pos}_avg_{stat}" for pos in POSITIONS for stat in POSITION_STATS
    ]
    t1_pos = [f1[k] for k in pos_feature_keys]
    t2_pos = [f2[k] for k in pos_feature_keys]

    all_features = t1_features + t2_features + diff_features + h2h_features + t1_pos + t2_pos
    return np.array(all_features).reshape(1, -1)


def get_feature_names() -> list[str]:
    """Return the ordered list of feature names matching build_matchup_features output."""
    feature_keys = [
        "win_rate", "avg_kills", "avg_deaths", "avg_towers", "avg_dragons",
        "avg_barons", "avg_inhibitors", "first_blood_rate", "first_tower_rate",
        "first_dragon_rate", "first_herald_rate", "avg_golddiffat10",
        "avg_golddiffat15", "avg_game_length",
    ]

    names = []
    for prefix in ("t1_", "t2_"):
        for k in feature_keys:
            names.append(f"{prefix}{k}")

    diff_keys = [
        "win_rate", "avg_kills", "avg_towers", "avg_dragons",
        "avg_golddiffat10", "avg_golddiffat15",
    ]
    for k in diff_keys:
        names.append(f"diff_{k}")

    names.extend(["h2h_win_rate_vs", "h2h_total_games_vs", "h2h_recent_form_vs"])

    # Per-position features (25 per team, 50 total)
    for prefix in ("t1_", "t2_"):
        for pos in POSITIONS:
            for stat in POSITION_STATS:
                names.append(f"{prefix}pos_{pos}_avg_{stat}")

    return names


def load_model(target_name: str):
    """Load a trained model from disk, using a cache to avoid repeated I/O.

    Args:
        target_name: Model name (e.g., 'winner', 'total_kills').

    Returns:
        Loaded model object, or None if file not found.
    """
    if target_name in _model_cache:
        return _model_cache[target_name]

    model_path = ML_MODELS_DIR / f"{target_name}.joblib"
    if not model_path.exists():
        return None

    import joblib

    model = joblib.load(model_path)
    _model_cache[target_name] = model
    return model


def clear_model_cache():
    """Clear the in-memory model cache (useful after retraining)."""
    _model_cache.clear()


def predict_match(team1_id: int, team2_id: int) -> dict:
    """Predict the outcome of a match between two teams.

    Args:
        team1_id: Database ID of team 1.
        team2_id: Database ID of team 2.

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

    features = build_matchup_features(team1_id, team2_id)
    if features is None:
        return {
            "team1_info": team1_info,
            "team2_info": team2_info,
            "predictions": None,
            "features_available": False,
            "models_loaded": False,
            "message": "Not enough match data for one or both teams.",
        }

    model_names = ["winner", "total_kills", "total_dragons", "total_towers", "game_time"]
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
    game_time = round(float(models["game_time"].predict(features)[0]), 1)

    # Clamp to reasonable ranges
    total_kills = max(0, total_kills)
    total_dragons = max(0, min(12, total_dragons))
    total_towers = max(0, min(22, total_towers))
    game_time = max(15, min(80, game_time))

    return {
        "team1_info": team1_info,
        "team2_info": team2_info,
        "predictions": {
            "team1_win_prob": team1_win_prob,
            "team2_win_prob": team2_win_prob,
            "total_kills": total_kills,
            "total_dragons": total_dragons,
            "total_towers": total_towers,
            "game_time": game_time,
        },
        "features_available": True,
        "models_loaded": True,
    }
