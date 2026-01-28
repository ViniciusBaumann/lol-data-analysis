"""Management command to train LightGBM draft prediction models.

Trains 1 classifier (blue side win probability) and 4 regression models
(total kills, towers, dragons, barons) based on:
- 10 champion features (8 per slot = 80 champion features)
- Player-specific champion performance (win rate, games played)
- Team synergy features
- Team rolling stats, ELO, H2H when teams are provided

Enhanced with:
- Player-specific champion win rates (strongest predictor per IEEE paper)
- Champion matchup considerations
- Improved hyperparameter tuning
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
)

DRAFT_POSITIONS = ["top", "jng", "mid", "bot", "sup"]
MIN_GAMES = 3
WINDOW = 10
DECAY_FACTOR = 0.75

# Number of team-context features appended after champion features.
# Updated for enhanced features:
# - 80 champion features (8 per slot × 10 slots)
# - 20 player-champion features (2 per slot × 10 slots: player_champ_wr, player_champ_games)
# - 106 team context features (same as before)
NUM_CHAMPION_FEATURES = 80
NUM_PLAYER_CHAMP_FEATURES = 20
NUM_TEAM_FEATURES = 106


class Command(BaseCommand):
    help = "Train LightGBM draft prediction models (champions + team context)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--no-tune",
            action="store_true",
            help="Skip Optuna hyperparameter tuning; use default parameters.",
        )

    def handle(self, *args, **options):
        no_tune = options["no_tune"]
        self.stdout.write("Building draft training dataset (champions + team context)...")

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
                self.style.ERROR("Not enough matches to train draft models (need at least 50).")
            )
            return

        # Pre-load all PlayerMatchStats
        self.stdout.write("Loading player match stats...")
        all_player_stats = PlayerMatchStats.objects.filter(
            match__in=match_list
        ).select_related("player")
        player_stats_by_match: dict[int, list] = defaultdict(list)
        player_stats_by_match_team: dict[int, dict[int, list]] = defaultdict(lambda: defaultdict(list))
        for ps in all_player_stats:
            player_stats_by_match[ps.match_id].append(ps)
            player_stats_by_match_team[ps.match_id][ps.team_id].append(ps)

        # Pre-load all TeamMatchStats
        self.stdout.write("Loading team match stats...")
        all_team_stats = TeamMatchStats.objects.filter(match__in=match_list).select_related("match")
        team_stats_by_match: dict[int, dict[int, TeamMatchStats]] = defaultdict(dict)
        for ts in all_team_stats:
            team_stats_by_match[ts.match_id][ts.team_id] = ts

        # ---------------------------------------------------------------
        # Chronological accumulators
        # ---------------------------------------------------------------
        # Champion history: (champion, position) -> list of per-game stats
        champion_history: dict[tuple[str, str], list[dict]] = defaultdict(list)

        # Player-champion history: (player_id, champion) -> list of {is_winner, ...}
        # This is the strongest predictor per IEEE paper (champion win rate by player)
        player_champion_history: dict[tuple[int, str], list[dict]] = defaultdict(list)

        # Player overall stats: player_id -> list of per-game stats
        player_history: dict[int, list[dict]] = defaultdict(list)

        # Team history: team_id -> list of match records (for rolling stats)
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
        team_last_split: dict[tuple, tuple] = {}

        rows = []
        skipped_insufficient = 0

        for match in match_list:
            blue_id = match.blue_team_id
            red_id = match.red_team_id
            league_id = match.league_id

            blue_key = (blue_id, league_id)
            red_key = (red_id, league_id)

            ps_list = player_stats_by_match.get(match.id, [])
            if len(ps_list) != 10:
                self._update_accumulators_after(
                    match, ps_list, team_stats_by_match, player_stats_by_match_team,
                    champion_history, player_champion_history, player_history,
                    team_history, team_last_roster,
                    team_roster_change_idx, elo_tracker, elo_blue_tracker,
                    elo_red_tracker, elo_matches_played, side_matches_blue,
                    side_matches_red, team_last_split,
                )
                continue

            blue_stat = team_stats_by_match.get(match.id, {}).get(blue_id)
            red_stat = team_stats_by_match.get(match.id, {}).get(red_id)
            if not blue_stat or not red_stat:
                self._update_accumulators_after(
                    match, ps_list, team_stats_by_match, player_stats_by_match_team,
                    champion_history, player_champion_history, player_history,
                    team_history, team_last_roster,
                    team_roster_change_idx, elo_tracker, elo_blue_tracker,
                    elo_red_tracker, elo_matches_played, side_matches_blue,
                    side_matches_red, team_last_split,
                )
                continue

            # Split decay BEFORE reading ELO
            current_split = (match.year, match.split) if match.split else None
            for key in (blue_key, red_key):
                if current_split and key in team_last_split and team_last_split[key] != current_split:
                    elo_tracker[key] = 1500.0 + DECAY_FACTOR * (elo_tracker[key] - 1500.0)
                    elo_blue_tracker[key] = 1500.0 + DECAY_FACTOR * (elo_blue_tracker[key] - 1500.0)
                    elo_red_tracker[key] = 1500.0 + DECAY_FACTOR * (elo_red_tracker[key] - 1500.0)
                if current_split:
                    team_last_split[key] = current_split

            # ---- Champion features (80) ----
            blue_players = {}
            red_players = {}
            for ps in ps_list:
                pos = ps.position.lower()
                if pos not in DRAFT_POSITIONS:
                    continue
                if ps.team_id == blue_id:
                    blue_players[pos] = ps
                elif ps.team_id == red_id:
                    red_players[pos] = ps

            if len(blue_players) != 5 or len(red_players) != 5:
                self._update_accumulators_after(
                    match, ps_list, team_stats_by_match, player_stats_by_match_team,
                    champion_history, player_champion_history, player_history,
                    team_history, team_last_roster,
                    team_roster_change_idx, elo_tracker, elo_blue_tracker,
                    elo_red_tracker, elo_matches_played, side_matches_blue,
                    side_matches_red, team_last_split,
                )
                continue

            champ_features = []
            all_have_champ_history = True

            for side_players in [blue_players, red_players]:
                for pos in DRAFT_POSITIONS:
                    ps = side_players[pos]
                    key = (ps.champion, pos)
                    history = champion_history[key]

                    if len(history) < MIN_GAMES:
                        all_have_champ_history = False
                        break

                    n = len(history)
                    wins = sum(1 for h in history if h["is_winner"])
                    champ_features.extend([
                        wins / n,
                        sum(h["kda"] for h in history) / n,
                        sum(h["kills"] for h in history) / n,
                        sum(h["deaths"] for h in history) / n,
                        sum(h["gold_per_min"] for h in history) / n,
                        sum(h["damage_per_min"] for h in history) / n,
                        sum(h["cs_per_min"] for h in history) / n,
                        float(n),
                    ])

                if not all_have_champ_history:
                    break

            if not all_have_champ_history:
                skipped_insufficient += 1
                self._update_accumulators_after(
                    match, ps_list, team_stats_by_match, player_stats_by_match_team,
                    champion_history, player_champion_history, player_history,
                    team_history, team_last_roster,
                    team_roster_change_idx, elo_tracker, elo_blue_tracker,
                    elo_red_tracker, elo_matches_played, side_matches_blue,
                    side_matches_red, team_last_split,
                )
                continue

            # ---- Player-champion features (20 = 2 per slot × 10 slots) ----
            # This is the strongest predictor per IEEE paper
            player_champ_features = []
            for side_players in [blue_players, red_players]:
                for pos in DRAFT_POSITIONS:
                    ps = side_players[pos]
                    player_id = ps.player_id
                    champion = ps.champion
                    pc_key = (player_id, champion)
                    pc_history = player_champion_history[pc_key]

                    if len(pc_history) > 0:
                        pc_wins = sum(1 for h in pc_history if h["is_winner"])
                        pc_wr = pc_wins / len(pc_history)
                        pc_games = float(len(pc_history))
                    else:
                        pc_wr = 0.5  # Default for no history
                        pc_games = 0.0

                    player_champ_features.extend([pc_wr, pc_games])

            # ---- Team context features (106) ----
            blue_hist = self._get_post_roster_history(
                blue_id, team_history, team_roster_change_idx, WINDOW
            )
            red_hist = self._get_post_roster_history(
                red_id, team_history, team_roster_change_idx, WINDOW
            )

            team_features_available = len(blue_hist) >= 3 and len(red_hist) >= 3

            if team_features_available:
                blue_team_feats = self._compute_features_from_history(blue_hist)
                red_team_feats = self._compute_features_from_history(red_hist)
                h2h_feats = self._compute_h2h_from_history(blue_id, red_id, match_list, match)

                feature_keys = list(blue_team_feats.keys())
                t1_vals = [blue_team_feats[k] for k in feature_keys]
                t2_vals = [red_team_feats[k] for k in feature_keys]

                diff_keys = [
                    "win_rate", "avg_kills", "avg_towers", "avg_dragons",
                    "avg_golddiffat10", "avg_golddiffat15",
                    "win_rate_last3", "win_rate_last5", "streak",
                ]
                diff_vals = [blue_team_feats[k] - red_team_feats[k] for k in diff_keys]

                h2h_vals = [
                    h2h_feats["win_rate_vs"],
                    h2h_feats["total_games_vs"],
                    h2h_feats["recent_form_vs"],
                ]

                # ELO features
                t1_elo = elo_tracker[blue_key]
                t2_elo = elo_tracker[red_key]
                t1_elo_side = elo_blue_tracker[blue_key]
                t2_elo_side = elo_red_tracker[red_key]
                elo_vals = [
                    t1_elo, t2_elo, t1_elo - t2_elo,
                    t1_elo_side, t2_elo_side, t1_elo_side - t2_elo_side,
                ]

                # Per-position features from team history
                blue_pos_feats = self._compute_position_features_from_history(blue_hist)
                red_pos_feats = self._compute_position_features_from_history(red_hist)
                pos_keys = [
                    f"pos_{pos}_avg_{stat}" for pos in POSITIONS for stat in POSITION_STATS
                ]
                t1_pos_vals = [blue_pos_feats[k] for k in pos_keys]
                t2_pos_vals = [red_pos_feats[k] for k in pos_keys]

                team_ctx = t1_vals + t2_vals + diff_vals + h2h_vals + elo_vals + t1_pos_vals + t2_pos_vals
            else:
                # Fill with zeros when team history insufficient
                team_ctx = [0.0] * NUM_TEAM_FEATURES

            # Combine all features: champion (80) + player-champion (20) + team context (106)
            all_features = champ_features + player_champ_features + team_ctx

            # Targets
            blue_wins = 1 if match.winner_id == blue_id else 0
            total_kills = (blue_stat.kills or 0) + (red_stat.kills or 0)
            total_towers = (blue_stat.towers or 0) + (red_stat.towers or 0)
            total_dragons = (blue_stat.dragons or 0) + (red_stat.dragons or 0)
            total_barons = (blue_stat.barons or 0) + (red_stat.barons or 0)

            rows.append({
                "features": all_features,
                "winner": blue_wins,
                "total_kills": total_kills,
                "total_towers": total_towers,
                "total_dragons": total_dragons,
                "total_barons": total_barons,
            })

            # Update accumulators AFTER feature extraction
            self._update_accumulators_after(
                match, ps_list, team_stats_by_match, player_stats_by_match_team,
                champion_history, player_champion_history, player_history,
                team_history, team_last_roster,
                team_roster_change_idx, elo_tracker, elo_blue_tracker,
                elo_red_tracker, elo_matches_played, side_matches_blue,
                side_matches_red, team_last_split,
            )

        self.stdout.write(
            f"Built {len(rows)} training samples "
            f"(skipped {skipped_insufficient} with insufficient champion history)."
        )
        if rows:
            feat_len = len(rows[0]["features"])
            self.stdout.write(
                f"Feature vector size: {feat_len} "
                f"(80 champion + 20 player-champion + {feat_len - 100} team context)"
            )

        if len(rows) < 30:
            self.stderr.write(
                self.style.ERROR("Not enough valid training samples (need at least 30).")
            )
            return

        X = np.array([r["features"] for r in rows])
        y_winner = np.array([r["winner"] for r in rows])
        y_kills = np.array([r["total_kills"] for r in rows])
        y_towers = np.array([r["total_towers"] for r in rows])
        y_dragons = np.array([r["total_dragons"] for r in rows])
        y_barons = np.array([r["total_barons"] for r in rows])

        train_end = int(len(rows) * 0.8)
        X_train = X[:train_end]
        X_test = X[train_end:]

        self.stdout.write(f"Train: {len(X_train)}, Test: {len(X_test)}")

        ML_MODELS_DIR.mkdir(parents=True, exist_ok=True)

        from lightgbm import LGBMClassifier, LGBMRegressor

        targets = {
            "draft_winner": {"y": y_winner, "type": "classification"},
            "draft_total_kills": {"y": y_kills, "type": "regression"},
            "draft_total_towers": {"y": y_towers, "type": "regression"},
            "draft_total_dragons": {"y": y_dragons, "type": "regression"},
            "draft_total_barons": {"y": y_barons, "type": "regression"},
        }

        all_best_params = {}

        for name, config in targets.items():
            y_all = config["y"]
            y_train = y_all[:train_end]
            y_test = y_all[train_end:]
            is_cls = config["type"] == "classification"

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
                n_trials = 100
                self.stdout.write(f"  {name}: running Optuna tuning ({n_trials} trials)...")
                params = self._tune_with_optuna(X_train, y_train, config["type"], n_trials=n_trials)
                self.stdout.write(f"  {name}: best params = {params}")

            all_best_params[name] = params

            if is_cls:
                model = LGBMClassifier(**params)
            else:
                model = LGBMRegressor(**params)
            model.fit(X_train, y_train)

            model_path = ML_MODELS_DIR / f"{name}.joblib"
            joblib.dump(model, model_path)

            if is_cls:
                preds = model.predict(X_test)
                probs = model.predict_proba(X_test)[:, 1]
                acc = accuracy_score(y_test, preds)
                auc = roc_auc_score(y_test, probs)
                brier = brier_score_loss(y_test, probs)
                logloss = log_loss(y_test, probs)
                self.stdout.write(
                    self.style.SUCCESS(
                        f"  {name}: Accuracy = {acc:.3f}, AUC = {auc:.4f}, "
                        f"Brier = {brier:.4f}, LogLoss = {logloss:.4f} -> {model_path}"
                    )
                )
            else:
                preds = model.predict(X_test)
                mae = mean_absolute_error(y_test, preds)
                self.stdout.write(
                    self.style.SUCCESS(f"  {name}: MAE = {mae:.3f} -> {model_path}")
                )

        params_path = ML_MODELS_DIR / "draft_best_params.json"
        with open(params_path, "w") as f:
            json.dump(all_best_params, f, indent=2)
        self.stdout.write(f"  Best params saved to {params_path}")

        clear_model_cache()
        self.stdout.write(self.style.SUCCESS("All draft models trained and saved."))

    # -------------------------------------------------------------------
    # Accumulator update (runs AFTER feature extraction for each match)
    # -------------------------------------------------------------------

    def _update_accumulators_after(
        self, match, ps_list, team_stats_by_match, player_stats_by_match_team,
        champion_history, player_champion_history, player_history,
        team_history, team_last_roster,
        team_roster_change_idx, elo_tracker, elo_blue_tracker,
        elo_red_tracker, elo_matches_played, side_matches_blue,
        side_matches_red, team_last_split,
    ):
        blue_id = match.blue_team_id
        red_id = match.red_team_id
        league_id = match.league_id
        blue_key = (blue_id, league_id)
        red_key = (red_id, league_id)

        blue_stat = team_stats_by_match.get(match.id, {}).get(blue_id)
        red_stat = team_stats_by_match.get(match.id, {}).get(red_id)

        # Update champion history and player-champion history
        for ps in ps_list:
            pos = ps.position.lower()
            if pos not in DRAFT_POSITIONS:
                continue
            ts = team_stats_by_match.get(match.id, {}).get(ps.team_id)
            is_winner = ts.is_winner if ts else False

            # Champion history (champion, position)
            champion_history[(ps.champion, pos)].append({
                "is_winner": is_winner,
                "kda": ps.kda or 0.0,
                "kills": ps.kills or 0,
                "deaths": ps.deaths or 0,
                "gold_per_min": ps.gold_per_min or 0.0,
                "damage_per_min": ps.damage_per_min or 0.0,
                "cs_per_min": ps.cs_per_min or 0.0,
            })

            # Player-champion history (player_id, champion) - strongest predictor
            player_champion_history[(ps.player_id, ps.champion)].append({
                "is_winner": is_winner,
                "kda": ps.kda or 0.0,
                "kills": ps.kills or 0,
                "deaths": ps.deaths or 0,
                "gold_per_min": ps.gold_per_min or 0.0,
                "damage_per_min": ps.damage_per_min or 0.0,
                "cs_per_min": ps.cs_per_min or 0.0,
            })

            # Player overall history
            player_history[ps.player_id].append({
                "is_winner": is_winner,
                "kda": ps.kda or 0.0,
                "kills": ps.kills or 0,
                "deaths": ps.deaths or 0,
                "gold_per_min": ps.gold_per_min or 0.0,
                "damage_per_min": ps.damage_per_min or 0.0,
                "cs_per_min": ps.cs_per_min or 0.0,
            })

        # Update team history
        for tid, stat in [(blue_id, blue_stat), (red_id, red_stat)]:
            if stat is None:
                continue
            p_list = player_stats_by_match_team.get(match.id, {}).get(tid, [])
            record = self._match_to_record(stat, match, p_list)
            team_history[tid].append(record)

        # Roster change detection
        for tid in (blue_id, red_id):
            p_list = player_stats_by_match_team.get(match.id, {}).get(tid, [])
            current_roster = frozenset(ps.player_id for ps in p_list)
            if current_roster and tid in team_last_roster and team_last_roster[tid]:
                diff = current_roster.symmetric_difference(team_last_roster[tid])
                if len(diff) >= ROSTER_CHANGE_THRESHOLD:
                    team_roster_change_idx[tid] = len(team_history[tid])
            if current_roster:
                team_last_roster[tid] = current_roster

        # Update ELO
        if match.winner_id and blue_stat and red_stat:
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

            # Side ELO
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

    # -------------------------------------------------------------------
    # Helper methods (same as train_prediction_model)
    # -------------------------------------------------------------------

    def _match_to_record(self, stat, match, player_stats=None):
        record = {
            "is_winner": stat.is_winner,
            "side": stat.side,
            "kills": stat.kills or 0,
            "deaths": stat.deaths or 0,
            "towers": stat.towers or 0,
            "dragons": stat.dragons or 0,
            "barons": stat.barons or 0,
            "inhibitors": stat.inhibitors or 0,
            "first_blood": stat.first_blood,
            "first_tower": stat.first_tower,
            "first_dragon": stat.first_dragon,
            "first_herald": stat.first_herald,
            "golddiffat10": stat.golddiffat10 or 0.0,
            "golddiffat15": stat.golddiffat15 or 0.0,
            "game_length": match.game_length or 30.0,
        }
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

    def _get_post_roster_history(self, team_id, team_history, team_roster_change_idx, window):
        full_history = team_history[team_id]
        change_idx = team_roster_change_idx.get(team_id, 0)
        relevant = full_history[change_idx:]
        return relevant[-window:]

    def _compute_features_from_history(self, history):
        n = len(history)
        wins = sum(1 for h in history if h["is_winner"])
        last3 = history[-3:] if n >= 3 else history
        last5 = history[-5:] if n >= 5 else history
        win_rate_last3 = sum(1 for h in last3 if h["is_winner"]) / len(last3)
        win_rate_last5 = sum(1 for h in last5 if h["is_winner"]) / len(last5)
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
        return {
            "win_rate": wins / n,
            "avg_kills": sum(h["kills"] for h in history) / n,
            "avg_deaths": sum(h["deaths"] for h in history) / n,
            "avg_towers": sum(h["towers"] for h in history) / n,
            "avg_dragons": sum(h["dragons"] for h in history) / n,
            "avg_barons": sum(h["barons"] for h in history) / n,
            "avg_inhibitors": sum(h["inhibitors"] for h in history) / n,
            "first_blood_rate": sum(1 for h in history if h["first_blood"]) / n,
            "first_tower_rate": sum(1 for h in history if h["first_tower"]) / n,
            "first_dragon_rate": sum(1 for h in history if h["first_dragon"]) / n,
            "first_herald_rate": sum(1 for h in history if h["first_herald"]) / n,
            "avg_golddiffat10": sum(h["golddiffat10"] for h in history) / n,
            "avg_golddiffat15": sum(h["golddiffat15"] for h in history) / n,
            "avg_game_length": sum(h["game_length"] for h in history) / n,
            "win_rate_last3": win_rate_last3,
            "win_rate_last5": win_rate_last5,
            "streak": streak,
            "blue_win_rate": blue_win_rate,
            "red_win_rate": red_win_rate,
        }

    def _compute_position_features_from_history(self, history):
        pos_accum = {
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

    def _compute_h2h_from_history(self, team1_id, team2_id, all_matches, current_match):
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
            return {"win_rate_vs": 0.5, "total_games_vs": 0, "recent_form_vs": 0.5}
        t1_wins = sum(1 for m in h2h_matches if m.winner_id == team1_id)
        recent = h2h_matches[-5:]
        recent_wins = sum(1 for m in recent if m.winner_id == team1_id)
        return {
            "win_rate_vs": t1_wins / total,
            "total_games_vs": total,
            "recent_form_vs": recent_wins / len(recent),
        }

    def _tune_with_optuna(self, X_train, y_train, model_type: str = "regression", n_trials: int = 100) -> dict:
        """Run Optuna hyperparameter tuning with TimeSeriesSplit cross-validation.

        Enhanced with:
        - More trials (100 by default)
        - ROC AUC scoring for classification
        - Better hyperparameter ranges
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

        study = optuna.create_study(
            direction="maximize",
            sampler=optuna.samplers.TPESampler(seed=42, n_startup_trials=20),
            pruner=optuna.pruners.MedianPruner(n_startup_trials=10, n_warmup_steps=5),
        )
        study.optimize(objective, n_trials=n_trials, show_progress_bar=False, n_jobs=1)
        best = study.best_params
        best["random_state"] = 42
        best["verbosity"] = -1
        best["n_jobs"] = 4
        return best
