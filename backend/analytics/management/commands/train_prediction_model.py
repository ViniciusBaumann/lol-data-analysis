"""Management command to train LightGBM prediction models with optional Optuna tuning and calibration.

Enhanced with:
- Player-specific champion win rates
- Extended early game features (XP diff, CS diff)
- Team damage type balance
- Improved hyperparameter tuning
- Patch-specific champion win rates
- Tournament stage/pressure indicators
- Team composition analysis
- Lane matchup advantages
- Player individual form
"""

import json
from collections import defaultdict

import joblib
import numpy as np
from django.core.management.base import BaseCommand
from sklearn.metrics import accuracy_score, brier_score_loss, log_loss, mean_absolute_error, roc_auc_score
from sklearn.model_selection import TimeSeriesSplit, cross_val_score

from analytics.models import Match, PlayerMatchStats, TeamMatchStats
from analytics.prediction import (
    ML_MODELS_DIR,
    POSITIONS,
    POSITION_STATS,
    ROSTER_CHANGE_THRESHOLD,
    clear_model_cache,
    get_feature_names,
)
from analytics.prediction_features import (
    compute_team_comp_features,
    compute_tournament_features,
    compute_lane_matchup_features,
    compute_player_form_features,
    parse_patch_to_numeric,
    get_champion_tags,
)

# =============================================================================
# MODEL CONFIGURATION CONSTANTS
# =============================================================================

# WINDOW: Number of recent matches to consider for rolling team statistics.
# A window of 10 balances recency (capturing current form) with stability
# (avoiding noise from single-game variance). Used for computing averages
# like win rate, kills, objectives, etc.
WINDOW = 10

# DECAY_FACTOR: ELO decay applied when a new split/season starts (0.0-1.0).
# Value of 0.75 means ELO regresses 25% toward baseline (1500) between splits.
# This accounts for roster changes, meta shifts, and practice gaps.
# Formula: new_elo = 1500 + DECAY_FACTOR * (old_elo - 1500)
DECAY_FACTOR = 0.75

# PLAYER_FORM_WINDOW: Number of recent games to consider for individual player
# performance tracking. Smaller than team WINDOW because player form is more
# volatile and recent performance is more predictive of current skill.
PLAYER_FORM_WINDOW = 10

# MIN_HISTORY_GAMES: Minimum number of historical games required for a team
# before including the match in training data. Ensures sufficient data for
# reliable feature computation. Value of 3 provides basic statistical stability.
MIN_HISTORY_GAMES = 3


class Command(BaseCommand):
    help = "Train LightGBM prediction models from historical match data with optional Optuna tuning and calibration."

    def add_arguments(self, parser):
        parser.add_argument(
            "--no-tune",
            action="store_true",
            help="Skip Optuna hyperparameter tuning; use default parameters.",
        )
        parser.add_argument(
            "--calibration",
            type=str,
            choices=["sigmoid", "isotonic", "none"],
            default="sigmoid",
            help="Calibration method for the winner classifier. Default: sigmoid.",
        )
        parser.add_argument(
            "--decay-factor",
            type=float,
            default=DECAY_FACTOR,
            help=f"Split decay factor (0-1). Default: {DECAY_FACTOR}",
        )

    def handle(self, *args, **options):
        no_tune = options["no_tune"]
        calibration_method = options["calibration"]
        decay_factor = options["decay_factor"]
        self.stdout.write(f"Calibration: {calibration_method}, Decay factor: {decay_factor}")
        self.stdout.write("Building training dataset...")

        matches = (
            Match.objects.filter(
                winner__isnull=False,
                game_length__isnull=False,
            )
            .select_related("blue_team", "red_team", "winner", "league")
            .order_by("date", "id")
        )

        match_list = list(matches)
        self.stdout.write(f"Found {len(match_list)} matches with valid data.")

        if len(match_list) < 50:
            self.stderr.write(
                self.style.ERROR("Not enough matches to train models (need at least 50).")
            )
            return

        # Pre-load all TeamMatchStats into a lookup dict
        self.stdout.write("Loading team match stats...")
        all_stats = TeamMatchStats.objects.filter(
            match__in=match_list
        ).select_related("match")

        stats_by_match: dict[int, dict[int, TeamMatchStats]] = defaultdict(dict)
        for stat in all_stats:
            stats_by_match[stat.match_id][stat.team_id] = stat

        # Pre-load all PlayerMatchStats for roster detection and position features
        self.stdout.write("Loading player match stats...")
        all_player_stats = PlayerMatchStats.objects.filter(
            match__in=match_list
        ).select_related("player")

        player_stats_by_match: dict[int, dict[int, list]] = defaultdict(lambda: defaultdict(list))
        for ps in all_player_stats:
            player_stats_by_match[ps.match_id][ps.team_id].append(ps)

        # Build rolling features per team with in-memory ELO tracker keyed by (team_id, league_id)
        self.stdout.write("Computing rolling features with per-league ELO tracking...")
        team_history: dict[int, list[dict]] = defaultdict(list)
        team_last_roster: dict[int, frozenset] = {}
        team_roster_change_idx: dict[int, int] = defaultdict(int)

        # In-memory ELO trackers keyed by (team_id, league_id)
        elo_tracker: dict[tuple, float] = defaultdict(lambda: 1500.0)
        elo_blue_tracker: dict[tuple, float] = defaultdict(lambda: 1500.0)
        elo_red_tracker: dict[tuple, float] = defaultdict(lambda: 1500.0)
        elo_matches_played: dict[tuple, int] = defaultdict(int)
        side_matches_blue: dict[tuple, int] = defaultdict(int)
        side_matches_red: dict[tuple, int] = defaultdict(int)

        # Split decay tracker
        team_last_split: dict[tuple, tuple] = {}

        # Advanced feature trackers
        # 1. Patch-specific champion stats: (champion, position, patch) -> list of records
        champion_patch_history: dict[tuple, list] = defaultdict(list)

        # 5. Lane matchup history: (champ1, champ2, position) -> list of records (alphabetically ordered)
        matchup_history: dict[tuple, list] = defaultdict(list)

        # 6. Player individual form: player_id -> list of recent game records
        player_form_history: dict[int, list] = defaultdict(list)

        rows = []
        total_matches = len(match_list)
        for idx, match in enumerate(match_list):
            # Progress indicator every 500 matches
            if idx % 500 == 0:
                self.stdout.write(f"  Processing match {idx + 1}/{total_matches} ({100 * idx / total_matches:.1f}%)...")
                self.stdout.flush()
            blue_id = match.blue_team_id
            red_id = match.red_team_id
            league_id = match.league_id

            blue_key = (blue_id, league_id)
            red_key = (red_id, league_id)

            blue_stat = stats_by_match.get(match.id, {}).get(blue_id)
            red_stat = stats_by_match.get(match.id, {}).get(red_id)
            if not blue_stat or not red_stat:
                continue

            # Get player lists early (needed for both features and accumulator updates)
            blue_player_list = player_stats_by_match.get(match.id, {}).get(blue_id, [])
            red_player_list = player_stats_by_match.get(match.id, {}).get(red_id, [])

            # Split decay BEFORE reading ELO
            current_split = (match.year, match.split) if match.split else None
            for key in (blue_key, red_key):
                if current_split and key in team_last_split and team_last_split[key] != current_split:
                    elo_tracker[key] = 1500.0 + decay_factor * (elo_tracker[key] - 1500.0)
                    elo_blue_tracker[key] = 1500.0 + decay_factor * (elo_blue_tracker[key] - 1500.0)
                    elo_red_tracker[key] = 1500.0 + decay_factor * (elo_red_tracker[key] - 1500.0)
                if current_split:
                    team_last_split[key] = current_split

            # Use shift(1): compute features from PREVIOUS matches (before this one)
            blue_hist = self._get_post_roster_history(
                blue_id, team_history, team_roster_change_idx, WINDOW
            )
            red_hist = self._get_post_roster_history(
                red_id, team_history, team_roster_change_idx, WINDOW
            )

            if len(blue_hist) >= MIN_HISTORY_GAMES and len(red_hist) >= MIN_HISTORY_GAMES:
                blue_features = self._compute_features_from_history(blue_hist)
                red_features = self._compute_features_from_history(red_hist)
                h2h_features = self._compute_h2h_from_history(blue_id, red_id, match_list, match)

                # Explicit feature key order to ensure consistency across training and inference
                # Must match the order in prediction.py build_matchup_features() and get_feature_names()
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

                t1_vals = [blue_features[k] for k in feature_keys]
                t2_vals = [red_features[k] for k in feature_keys]

                diff_keys = [
                    "win_rate", "avg_kills", "avg_towers", "avg_dragons",
                    "avg_golddiffat10", "avg_golddiffat15",
                    "avg_xpdiffat10", "avg_xpdiffat15",
                    "avg_csdiffat10", "avg_csdiffat15",
                    "win_rate_last3", "win_rate_last5", "streak", "momentum",
                    "first_blood_rate", "first_tower_rate", "first_dragon_rate",
                ]
                diff_vals = [blue_features[k] - red_features[k] for k in diff_keys]

                h2h_vals = [
                    h2h_features["win_rate_vs"],
                    h2h_features["total_games_vs"],
                    h2h_features["recent_form_vs"],
                    h2h_features.get("avg_gold_diff_vs", 0),
                    h2h_features.get("avg_game_duration_vs", 30),
                ]

                # ELO features (from in-memory tracker BEFORE this match) — 6 features
                t1_elo = elo_tracker[blue_key]
                t2_elo = elo_tracker[red_key]
                t1_elo_side = elo_blue_tracker[blue_key]
                t2_elo_side = elo_red_tracker[red_key]

                elo_vals = [
                    t1_elo, t2_elo, t1_elo - t2_elo,
                    t1_elo_side, t2_elo_side, t1_elo_side - t2_elo_side,
                ]

                # Per-position features
                blue_pos_features = self._compute_position_features_from_history(blue_hist)
                red_pos_features = self._compute_position_features_from_history(red_hist)

                pos_feature_keys = [
                    f"pos_{pos}_avg_{stat}" for pos in POSITIONS for stat in POSITION_STATS
                ]
                t1_pos_vals = [blue_pos_features[k] for k in pos_feature_keys]
                t2_pos_vals = [red_pos_features[k] for k in pos_feature_keys]

                # === ADVANCED FEATURES ===

                # 3. Tournament stage features
                tournament_feats = compute_tournament_features(match, getattr(match, 'playoffs', False))
                tournament_vals = [
                    tournament_feats["is_playoffs"],
                    tournament_feats["is_finals"],
                    tournament_feats["stage_importance"],
                    tournament_feats["stage_code"],
                ]

                # Get champions and players for this match
                blue_champions = {}
                red_champions = {}
                blue_player_ids = {}
                red_player_ids = {}

                blue_player_list = player_stats_by_match.get(match.id, {}).get(blue_id, [])
                red_player_list = player_stats_by_match.get(match.id, {}).get(red_id, [])

                for ps in blue_player_list:
                    pos = ps.position.lower()
                    if pos in POSITIONS:
                        blue_champions[pos] = ps.champion
                        blue_player_ids[pos] = ps.player_id

                for ps in red_player_list:
                    pos = ps.position.lower()
                    if pos in POSITIONS:
                        red_champions[pos] = ps.champion
                        red_player_ids[pos] = ps.player_id

                # 4. Team composition features
                blue_comp_feats = compute_team_comp_features(blue_champions, "blue")
                red_comp_feats = compute_team_comp_features(red_champions, "red")

                comp_vals = []
                for key in [
                    "comp_early_game", "comp_scaling", "comp_teamfight", "comp_splitpush",
                    "comp_poke", "comp_engage", "comp_pick", "comp_ap_count", "comp_ad_count",
                    "comp_has_tank", "comp_has_engage", "comp_has_hypercarry",
                    "comp_has_assassin", "comp_has_peel", "comp_hypercarry_with_peel",
                    "comp_engage_with_followup",
                ]:
                    comp_vals.append(blue_comp_feats.get(f"blue_{key}", 0.0))
                for key in [
                    "comp_early_game", "comp_scaling", "comp_teamfight", "comp_splitpush",
                    "comp_poke", "comp_engage", "comp_pick", "comp_ap_count", "comp_ad_count",
                    "comp_has_tank", "comp_has_engage", "comp_has_hypercarry",
                    "comp_has_assassin", "comp_has_peel", "comp_hypercarry_with_peel",
                    "comp_engage_with_followup",
                ]:
                    comp_vals.append(red_comp_feats.get(f"red_{key}", 0.0))

                # Comp differential features
                comp_diff_vals = [
                    blue_comp_feats.get("blue_comp_early_game", 0) - red_comp_feats.get("red_comp_early_game", 0),
                    blue_comp_feats.get("blue_comp_scaling", 0) - red_comp_feats.get("red_comp_scaling", 0),
                    blue_comp_feats.get("blue_comp_teamfight", 0) - red_comp_feats.get("red_comp_teamfight", 0),
                    blue_comp_feats.get("blue_comp_engage", 0) - red_comp_feats.get("red_comp_engage", 0),
                ]

                # 5. Lane matchup features
                matchup_feats = compute_lane_matchup_features(blue_champions, red_champions, matchup_history)
                matchup_vals = [
                    matchup_feats.get("matchup_top_advantage", 0.0),
                    matchup_feats.get("matchup_jng_advantage", 0.0),
                    matchup_feats.get("matchup_mid_advantage", 0.0),
                    matchup_feats.get("matchup_bot_advantage", 0.0),
                    matchup_feats.get("matchup_sup_advantage", 0.0),
                    matchup_feats.get("matchup_total_advantage", 0.0),
                ]

                # 6. Player form features
                player_form_vals = []
                for pos in POSITIONS:
                    blue_pid = blue_player_ids.get(pos)
                    if blue_pid and blue_pid in player_form_history:
                        p_hist = player_form_history[blue_pid][-PLAYER_FORM_WINDOW:]
                        if len(p_hist) >= 2:
                            p_wins = sum(1 for h in p_hist if h.get("is_winner", False))
                            p_kda = sum(h.get("kda", 0) for h in p_hist) / len(p_hist)
                            player_form_vals.extend([p_wins / len(p_hist), p_kda])
                        else:
                            player_form_vals.extend([0.5, 3.0])
                    else:
                        player_form_vals.extend([0.5, 3.0])

                for pos in POSITIONS:
                    red_pid = red_player_ids.get(pos)
                    if red_pid and red_pid in player_form_history:
                        p_hist = player_form_history[red_pid][-PLAYER_FORM_WINDOW:]
                        if len(p_hist) >= 2:
                            p_wins = sum(1 for h in p_hist if h.get("is_winner", False))
                            p_kda = sum(h.get("kda", 0) for h in p_hist) / len(p_hist)
                            player_form_vals.extend([p_wins / len(p_hist), p_kda])
                        else:
                            player_form_vals.extend([0.5, 3.0])
                    else:
                        player_form_vals.extend([0.5, 3.0])

                # Player form advantage
                blue_form_avg = sum(player_form_vals[i] for i in range(0, 10, 2)) / 5.0
                red_form_avg = sum(player_form_vals[i] for i in range(10, 20, 2)) / 5.0
                player_form_vals.extend([blue_form_avg, red_form_avg, blue_form_avg - red_form_avg])

                # 1. Patch features
                patch_numeric = parse_patch_to_numeric(match.patch or "")

                # Compute average patch win rate for each team's champions
                blue_patch_wr_sum = 0.0
                red_patch_wr_sum = 0.0
                blue_patch_count = 0
                red_patch_count = 0

                for pos, champ in blue_champions.items():
                    key = (champ, pos, match.patch)
                    hist = champion_patch_history.get(key, [])
                    if len(hist) >= 3:
                        wins = sum(1 for h in hist if h.get("is_winner", False))
                        blue_patch_wr_sum += wins / len(hist)
                        blue_patch_count += 1

                for pos, champ in red_champions.items():
                    key = (champ, pos, match.patch)
                    hist = champion_patch_history.get(key, [])
                    if len(hist) >= 3:
                        wins = sum(1 for h in hist if h.get("is_winner", False))
                        red_patch_wr_sum += wins / len(hist)
                        red_patch_count += 1

                avg_blue_patch_wr = blue_patch_wr_sum / blue_patch_count if blue_patch_count > 0 else 0.5
                avg_red_patch_wr = red_patch_wr_sum / red_patch_count if red_patch_count > 0 else 0.5

                patch_vals = [
                    patch_numeric,
                    avg_blue_patch_wr,
                    avg_red_patch_wr,
                    avg_blue_patch_wr - avg_red_patch_wr,
                ]

                # Combine all features
                all_features = (
                    t1_vals + t2_vals + diff_vals + h2h_vals + elo_vals + t1_pos_vals + t2_pos_vals +
                    tournament_vals + comp_vals + comp_diff_vals + matchup_vals + player_form_vals + patch_vals
                )

                # Targets
                team1_wins = 1 if match.winner_id == blue_id else 0

                # Combined stats
                total_kills = (blue_stat.kills or 0) + (red_stat.kills or 0)
                total_dragons = (blue_stat.dragons or 0) + (red_stat.dragons or 0)
                total_towers = (blue_stat.towers or 0) + (red_stat.towers or 0)
                total_barons = (blue_stat.barons or 0) + (red_stat.barons or 0)
                game_time = match.game_length or 0

                rows.append({
                    "features": all_features,
                    "winner": team1_wins,
                    "total_kills": total_kills,
                    "total_dragons": total_dragons,
                    "total_towers": total_towers,
                    "total_barons": total_barons,
                    "game_time": game_time,
                })

            # Update in-memory ELO AFTER using it for features (avoid leakage)
            winner_id = match.winner_id
            blue_elo = elo_tracker[blue_key]
            red_elo = elo_tracker[red_key]

            k_blue = 40 if elo_matches_played[blue_key] < 30 else 32
            k_red = 40 if elo_matches_played[red_key] < 30 else 32

            expected_blue = 1 / (1 + 10 ** ((red_elo - blue_elo) / 400))
            expected_red = 1 - expected_blue

            actual_blue = 1.0 if winner_id == blue_id else 0.0
            actual_red = 1.0 - actual_blue

            elo_tracker[blue_key] = blue_elo + k_blue * (actual_blue - expected_blue)
            elo_tracker[red_key] = red_elo + k_red * (actual_red - expected_red)

            elo_matches_played[blue_key] += 1
            elo_matches_played[red_key] += 1

            # Side ELO update — simultaneous read (no asymmetry)
            blue_side_elo = elo_blue_tracker[blue_key]
            red_side_elo = elo_red_tracker[red_key]

            k_blue_side = 48 if side_matches_blue[blue_key] < 15 else 36
            k_red_side = 48 if side_matches_red[red_key] < 15 else 36

            expected_blue_side = 1 / (1 + 10 ** ((red_side_elo - blue_side_elo) / 400))
            expected_red_side = 1 - expected_blue_side

            elo_blue_tracker[blue_key] = blue_side_elo + k_blue_side * (actual_blue - expected_blue_side)
            elo_red_tracker[red_key] = red_side_elo + k_red_side * (actual_red - expected_red_side)

            side_matches_blue[blue_key] += 1
            side_matches_red[red_key] += 1

            # Add current match to history (AFTER using features, to avoid leakage)
            match_record = self._match_to_record(blue_stat, match, blue_player_list)
            team_history[blue_id].append(match_record)

            match_record_red = self._match_to_record(red_stat, match, red_player_list)
            team_history[red_id].append(match_record_red)

            # Roster change detection
            for tid, p_list in ((blue_id, blue_player_list), (red_id, red_player_list)):
                current_roster = frozenset(ps.player_id for ps in p_list)
                if current_roster and tid in team_last_roster and team_last_roster[tid]:
                    diff = current_roster.symmetric_difference(team_last_roster[tid])
                    if len(diff) >= ROSTER_CHANGE_THRESHOLD:
                        team_roster_change_idx[tid] = len(team_history[tid])
                if current_roster:
                    team_last_roster[tid] = current_roster

            # Update advanced feature accumulators AFTER using them
            # 1. Patch-specific champion history
            for ps in blue_player_list + red_player_list:
                pos = ps.position.lower()
                if pos in POSITIONS and ps.champion and match.patch:
                    ts = stats_by_match.get(match.id, {}).get(ps.team_id)
                    is_winner = ts.is_winner if ts else False
                    key = (ps.champion, pos, match.patch)
                    champion_patch_history[key].append({
                        "is_winner": is_winner,
                        "kda": ps.kda or 0.0,
                    })

            # 5. Lane matchup history
            for pos in POSITIONS:
                blue_champ = None
                red_champ = None
                blue_ps = None
                red_ps = None

                for ps in blue_player_list:
                    if ps.position.lower() == pos:
                        blue_champ = ps.champion
                        blue_ps = ps
                        break
                for ps in red_player_list:
                    if ps.position.lower() == pos:
                        red_champ = ps.champion
                        red_ps = ps
                        break

                if blue_champ and red_champ:
                    # Normalize key (alphabetical order)
                    if blue_champ < red_champ:
                        key = (blue_champ, red_champ, pos)
                        blue_is_first = True
                    else:
                        key = (red_champ, blue_champ, pos)
                        blue_is_first = False

                    blue_ts = stats_by_match.get(match.id, {}).get(blue_id)
                    blue_won = blue_ts.is_winner if blue_ts else False

                    matchup_history[key].append({
                        "winner_is_first": blue_won if blue_is_first else not blue_won,
                    })

            # 6. Player form history
            for ps in blue_player_list + red_player_list:
                ts = stats_by_match.get(match.id, {}).get(ps.team_id)
                is_winner = ts.is_winner if ts else False
                player_form_history[ps.player_id].append({
                    "is_winner": is_winner,
                    "kda": ps.kda or 0.0,
                    "cs_per_min": ps.cs_per_min or 0.0,
                    "damage_per_min": ps.damage_per_min or 0.0,
                    "gold_per_min": ps.gold_per_min or 0.0,
                })

        self.stdout.write(f"  Processing complete. Processed {total_matches} matches.")
        self.stdout.write(f"Built {len(rows)} training samples.")
        if rows:
            self.stdout.write(f"Feature vector size: {len(rows[0]['features'])} features")

        if len(rows) < 30:
            self.stderr.write(
                self.style.ERROR("Not enough valid training samples (need at least 30).")
            )
            return

        # Convert to arrays
        X = np.array([r["features"] for r in rows])
        y_winner = np.array([r["winner"] for r in rows])
        y_kills = np.array([r["total_kills"] for r in rows])
        y_dragons = np.array([r["total_dragons"] for r in rows])
        y_towers = np.array([r["total_towers"] for r in rows])
        y_barons = np.array([r["total_barons"] for r in rows])
        y_game_time = np.array([r["game_time"] for r in rows])

        # Determine split indices based on calibration
        use_calibration = calibration_method != "none"

        if use_calibration:
            # 70% train, 10% calibration, 20% test
            train_end = int(len(rows) * 0.7)
            cal_end = int(len(rows) * 0.8)
        else:
            # 80% train, 20% test
            train_end = int(len(rows) * 0.8)
            cal_end = train_end  # no calibration set

        X_train = X[:train_end]
        X_cal = X[train_end:cal_end] if use_calibration else None
        X_test = X[cal_end:]

        self.stdout.write(
            f"Train: {len(X_train)}, "
            + (f"Cal: {cal_end - train_end}, " if use_calibration else "")
            + f"Test: {len(X_test)}"
        )

        # Ensure output directory exists
        ML_MODELS_DIR.mkdir(parents=True, exist_ok=True)

        from lightgbm import LGBMClassifier, LGBMRegressor

        targets = {
            "winner": {"y": y_winner, "type": "classification"},
            "total_kills": {"y": y_kills, "type": "regression"},
            "total_dragons": {"y": y_dragons, "type": "regression"},
            "total_towers": {"y": y_towers, "type": "regression"},
            "total_barons": {"y": y_barons, "type": "regression"},
            "game_time": {"y": y_game_time, "type": "regression"},
        }

        all_best_params = {}

        for name, config in targets.items():
            y_all = config["y"]
            y_train = y_all[:train_end]
            y_test = y_all[cal_end:]

            if no_tune:
                # Improved default parameters
                params = {
                    "n_estimators": 300,
                    "max_depth": 8,
                    "learning_rate": 0.05,
                    "num_leaves": 63,
                    "min_child_samples": 20,
                    "subsample": 0.8,
                    "colsample_bytree": 0.8,
                    "reg_alpha": 0.1,
                    "reg_lambda": 0.1,
                    "random_state": 42,
                    "verbosity": -1,
                    "n_jobs": 4,
                }
                self.stdout.write(f"  {name}: training with optimized default params...")
            else:
                # Optuna tuning with 100 trials
                n_trials = 100
                self.stdout.write(f"  {name}: running Optuna tuning ({n_trials} trials)...")
                params = self._tune_with_optuna(
                    X_train, y_train, config["type"], n_trials=n_trials
                )
                self.stdout.write(f"  {name}: best params = {params}")

            all_best_params[name] = params

            if config["type"] == "classification":
                model = LGBMClassifier(**params)
            else:
                model = LGBMRegressor(**params)

            self.stdout.write(f"  {name}: fitting model...")
            self.stdout.flush()
            model.fit(X_train, y_train)

            # Apply calibration for winner classifier
            if config["type"] == "classification" and use_calibration:
                y_cal = y_all[train_end:cal_end]
                n_cal = len(y_cal)

                if n_cal >= 500:
                    self.stdout.write(
                        f"  Hint: --calibration isotonic may be better for n_cal={n_cal}"
                    )

                from sklearn.calibration import CalibratedClassifierCV
                calibrated_model = CalibratedClassifierCV(
                    model, method=calibration_method, cv="prefit"
                )
                calibrated_model.fit(X_cal, y_cal)

                # Save calibrated model
                model_path = ML_MODELS_DIR / f"{name}.joblib"
                joblib.dump(calibrated_model, model_path)

                # Evaluate
                preds = calibrated_model.predict(X_test)
                probs = calibrated_model.predict_proba(X_test)[:, 1]
                acc = accuracy_score(y_test, preds)
                auc = roc_auc_score(y_test, probs)
                brier = brier_score_loss(y_test, probs)
                logloss = log_loss(y_test, probs)
                self.stdout.write(
                    self.style.SUCCESS(
                        f"  {name}: Accuracy = {acc:.3f}, AUC = {auc:.4f}, "
                        f"Brier = {brier:.4f}, LogLoss = {logloss:.4f} "
                        f"(calibrated: {calibration_method}) -> {model_path}"
                    )
                )
            elif config["type"] == "classification":
                # No calibration
                model_path = ML_MODELS_DIR / f"{name}.joblib"
                joblib.dump(model, model_path)

                preds = model.predict(X_test)
                probs = model.predict_proba(X_test)[:, 1]
                acc = accuracy_score(y_test, preds)
                auc = roc_auc_score(y_test, probs)
                brier = brier_score_loss(y_test, probs)
                logloss = log_loss(y_test, probs)
                self.stdout.write(
                    self.style.SUCCESS(
                        f"  {name}: Accuracy = {acc:.3f}, AUC = {auc:.4f}, "
                        f"Brier = {brier:.4f}, LogLoss = {logloss:.4f} "
                        f"(no calibration) -> {model_path}"
                    )
                )
            else:
                # Regression — use full 80/20 split for regressors
                # Regressors train on train+cal combined
                if use_calibration:
                    X_train_reg = X[:cal_end]
                    y_train_reg = y_all[:cal_end]
                    model_reg = LGBMRegressor(**params)
                    model_reg.fit(X_train_reg, y_train_reg)
                    model = model_reg

                model_path = ML_MODELS_DIR / f"{name}.joblib"
                joblib.dump(model, model_path)

                preds = model.predict(X_test)
                mae = mean_absolute_error(y_test, preds)
                self.stdout.write(
                    self.style.SUCCESS(f"  {name}: MAE = {mae:.3f} -> {model_path}")
                )

        # Save best params as JSON for reference
        params_path = ML_MODELS_DIR / "best_params.json"
        with open(params_path, "w") as f:
            json.dump(all_best_params, f, indent=2)
        self.stdout.write(f"  Best params saved to {params_path}")

        clear_model_cache()
        self.stdout.write(self.style.SUCCESS("All models trained and saved."))

    def _tune_with_optuna(self, X_train, y_train, model_type: str, n_trials: int = 100) -> dict:
        """Run Optuna hyperparameter tuning with TimeSeriesSplit cross-validation.

        Enhanced with:
        - More trials (100 by default)
        - ROC AUC scoring for classification
        - Better hyperparameter ranges
        - Early stopping callback
        """
        import optuna
        from lightgbm import LGBMClassifier, LGBMRegressor

        optuna.logging.set_verbosity(optuna.logging.WARNING)

        tscv = TimeSeriesSplit(n_splits=5)

        def objective(trial):
            params = {
                "n_estimators": trial.suggest_int("n_estimators", 100, 800),
                "max_depth": trial.suggest_int("max_depth", 3, 12),
                "learning_rate": trial.suggest_float("learning_rate", 0.005, 0.3, log=True),
                "num_leaves": trial.suggest_int("num_leaves", 15, 127),
                "min_child_samples": trial.suggest_int("min_child_samples", 5, 100),
                "min_child_weight": trial.suggest_float("min_child_weight", 1e-5, 10, log=True),
                "subsample": trial.suggest_float("subsample", 0.5, 1.0),
                "subsample_freq": trial.suggest_int("subsample_freq", 1, 7),
                "colsample_bytree": trial.suggest_float("colsample_bytree", 0.5, 1.0),
                "reg_alpha": trial.suggest_float("reg_alpha", 1e-8, 100.0, log=True),
                "reg_lambda": trial.suggest_float("reg_lambda", 1e-8, 100.0, log=True),
                "random_state": 42,
                "verbosity": -1,
                "n_jobs": 4,
            }

            if model_type == "classification":
                model = LGBMClassifier(**params)
                # Use ROC AUC for better probability calibration
                scoring = "roc_auc"
            else:
                model = LGBMRegressor(**params)
                scoring = "neg_mean_absolute_error"

            scores = cross_val_score(model, X_train, y_train, cv=tscv, scoring=scoring)
            return scores.mean()

        # Progress callback for Optuna
        def progress_callback(study, trial):
            if trial.number % 10 == 0:
                print(f"    Trial {trial.number + 1}/{n_trials} completed (best so far: {study.best_value:.4f})")

        # Add pruning for faster optimization
        study = optuna.create_study(
            direction="maximize",
            sampler=optuna.samplers.TPESampler(seed=42, n_startup_trials=20),
            pruner=optuna.pruners.MedianPruner(n_startup_trials=10, n_warmup_steps=5),
        )
        study.optimize(objective, n_trials=n_trials, show_progress_bar=False, n_jobs=1, callbacks=[progress_callback])

        best = study.best_params
        best["random_state"] = 42
        best["verbosity"] = -1
        best["n_jobs"] = 4
        return best

    def _match_to_record(
        self, stat: TeamMatchStats, match: Match, player_stats: list | None = None
    ) -> dict:
        """Convert a TeamMatchStats + Match into a dict record for rolling history."""
        record = {
            "is_winner": stat.is_winner,
            "side": stat.side,
            "kills": stat.kills or 0,
            "deaths": stat.deaths or 0,
            "towers": stat.towers or 0,
            "dragons": stat.dragons or 0,
            "barons": stat.barons or 0,
            "heralds": stat.heralds or 0,
            "voidgrubs": stat.voidgrubs or 0,
            "inhibitors": stat.inhibitors or 0,
            "first_blood": stat.first_blood,
            "first_tower": stat.first_tower,
            "first_dragon": stat.first_dragon,
            "first_herald": stat.first_herald,
            "first_baron": stat.first_baron,
            "golddiffat10": stat.golddiffat10 or 0.0,
            "golddiffat15": stat.golddiffat15 or 0.0,
            # Extended early game features
            "xpdiffat10": stat.xpdiffat10 or 0.0,
            "xpdiffat15": stat.xpdiffat15 or 0.0,
            "csdiffat10": stat.csdiffat10 or 0.0,
            "csdiffat15": stat.csdiffat15 or 0.0,
            "game_length": match.game_length or 30.0,
            "total_gold": stat.total_gold or 0.0,
        }

        # Add per-position stats for roster-aware features
        if player_stats:
            record["player_ids"] = frozenset(ps.player_id for ps in player_stats)
            position_stats = {}
            for ps in player_stats:
                pos = ps.position.lower()
                if pos in POSITIONS:
                    position_stats[pos] = {
                        "kda": ps.kda or 0.0,
                        "cs_per_min": ps.cs_per_min or 0.0,
                        "damage_per_min": ps.damage_per_min or 0.0,
                        "gold_per_min": ps.gold_per_min or 0.0,
                        "vision_score": ps.vision_score or 0.0,
                    }
            record["position_stats"] = position_stats
        else:
            record["player_ids"] = frozenset()
            record["position_stats"] = {}

        return record

    def _get_post_roster_history(
        self, team_id: int, team_history: dict, team_roster_change_idx: dict, window: int
    ) -> list[dict]:
        """Return the most recent history slice after the last roster change."""
        full_history = team_history[team_id]
        change_idx = team_roster_change_idx.get(team_id, 0)
        relevant = full_history[change_idx:]
        return relevant[-window:]

    def _compute_position_features_from_history(self, history: list[dict]) -> dict:
        """Compute average per-position stats from a list of match records."""
        pos_accum: dict[str, dict[str, list[float]]] = {
            pos: {stat: [] for stat in POSITION_STATS} for pos in POSITIONS
        }

        for record in history:
            pos_stats = record.get("position_stats", {})
            for pos in POSITIONS:
                if pos in pos_stats:
                    for stat in POSITION_STATS:
                        pos_accum[pos][stat].append(pos_stats[pos].get(stat, 0.0))

        features = {}
        for pos in POSITIONS:
            for stat in POSITION_STATS:
                vals = pos_accum[pos][stat]
                features[f"pos_{pos}_avg_{stat}"] = sum(vals) / len(vals) if vals else 0.0

        return features

    def _compute_features_from_history(self, history: list[dict]) -> dict:
        """Compute aggregate features from a list of match records."""
        n = len(history)
        wins = sum(1 for h in history if h["is_winner"])

        # Recent form
        last3 = history[-3:] if n >= 3 else history
        last5 = history[-5:] if n >= 5 else history
        win_rate_last3 = sum(1 for h in last3 if h["is_winner"]) / len(last3)
        win_rate_last5 = sum(1 for h in last5 if h["is_winner"]) / len(last5)

        # Win/loss streak (positive = wins, negative = losses)
        streak = 0
        for h in reversed(history):
            if h["is_winner"]:
                if streak < 0:
                    break
                streak += 1
            else:
                if streak > 0:
                    break
                streak -= 1

        # Side-specific win rates
        blue_games = [h for h in history if h.get("side") == "Blue"]
        red_games = [h for h in history if h.get("side") == "Red"]
        blue_win_rate = (
            sum(1 for h in blue_games if h["is_winner"]) / len(blue_games)
            if blue_games else 0.5
        )
        red_win_rate = (
            sum(1 for h in red_games if h["is_winner"]) / len(red_games)
            if red_games else 0.5
        )

        # First objective rates
        first_blood_rate = sum(1 for h in history if h["first_blood"]) / n
        first_tower_rate = sum(1 for h in history if h["first_tower"]) / n
        first_dragon_rate = sum(1 for h in history if h["first_dragon"]) / n
        first_herald_rate = sum(1 for h in history if h["first_herald"]) / n
        first_baron_rate = sum(1 for h in history if h.get("first_baron", False)) / n

        # Extended early game features
        avg_xpdiffat10 = sum(h.get("xpdiffat10", 0) for h in history) / n
        avg_xpdiffat15 = sum(h.get("xpdiffat15", 0) for h in history) / n
        avg_csdiffat10 = sum(h.get("csdiffat10", 0) for h in history) / n
        avg_csdiffat15 = sum(h.get("csdiffat15", 0) for h in history) / n

        # Objective control
        avg_heralds = sum(h.get("heralds", 0) for h in history) / n
        avg_voidgrubs = sum(h.get("voidgrubs", 0) for h in history) / n

        # Compute momentum (trend in last 5 games)
        if len(history) >= 5:
            recent_wins = sum(1 for h in history[-5:] if h["is_winner"])
            older_wins = sum(1 for h in history[-10:-5] if h["is_winner"]) if len(history) >= 10 else recent_wins
            momentum = (recent_wins - older_wins) / 5.0
        else:
            momentum = 0.0

        return {
            "win_rate": wins / n,
            "avg_kills": sum(h["kills"] for h in history) / n,
            "avg_deaths": sum(h["deaths"] for h in history) / n,
            "avg_towers": sum(h["towers"] for h in history) / n,
            "avg_dragons": sum(h["dragons"] for h in history) / n,
            "avg_barons": sum(h["barons"] for h in history) / n,
            "avg_heralds": avg_heralds,
            "avg_voidgrubs": avg_voidgrubs,
            "avg_inhibitors": sum(h["inhibitors"] for h in history) / n,
            "first_blood_rate": first_blood_rate,
            "first_tower_rate": first_tower_rate,
            "first_dragon_rate": first_dragon_rate,
            "first_herald_rate": first_herald_rate,
            "first_baron_rate": first_baron_rate,
            "avg_golddiffat10": sum(h["golddiffat10"] for h in history) / n,
            "avg_golddiffat15": sum(h["golddiffat15"] for h in history) / n,
            "avg_xpdiffat10": avg_xpdiffat10,
            "avg_xpdiffat15": avg_xpdiffat15,
            "avg_csdiffat10": avg_csdiffat10,
            "avg_csdiffat15": avg_csdiffat15,
            "avg_game_length": sum(h["game_length"] for h in history) / n,
            "win_rate_last3": win_rate_last3,
            "win_rate_last5": win_rate_last5,
            "streak": streak,
            "momentum": momentum,
            "blue_win_rate": blue_win_rate,
            "red_win_rate": red_win_rate,
        }

    def _compute_h2h_from_history(
        self, team1_id: int, team2_id: int, all_matches: list, current_match
    ) -> dict:
        """Compute head-to-head features from matches occurring before the current match."""
        h2h_matches = []
        for m in all_matches:
            if m.id == current_match.id:
                break
            if (
                (m.blue_team_id == team1_id and m.red_team_id == team2_id)
                or (m.blue_team_id == team2_id and m.red_team_id == team1_id)
            ):
                h2h_matches.append(m)

        total = len(h2h_matches)
        if total == 0:
            return {
                "win_rate_vs": 0.5,
                "total_games_vs": 0,
                "recent_form_vs": 0.5,
                "avg_gold_diff_vs": 0,
                "avg_game_duration_vs": 30,
            }

        t1_wins = sum(1 for m in h2h_matches if m.winner_id == team1_id)
        recent = h2h_matches[-5:]
        recent_wins = sum(1 for m in recent if m.winner_id == team1_id)

        # Average game duration in H2H
        game_lengths = [m.game_length for m in h2h_matches if m.game_length]
        avg_game_duration = sum(game_lengths) / len(game_lengths) if game_lengths else 30

        return {
            "win_rate_vs": t1_wins / total,
            "total_games_vs": total,
            "recent_form_vs": recent_wins / len(recent),
            "avg_gold_diff_vs": 0,  # Would need TeamMatchStats lookup for this
            "avg_game_duration_vs": avg_game_duration,
        }
