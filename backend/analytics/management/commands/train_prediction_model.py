"""Management command to train LightGBM prediction models with optional Optuna tuning and calibration."""

import json
from collections import defaultdict

import joblib
import numpy as np
from django.core.management.base import BaseCommand
from sklearn.metrics import accuracy_score, brier_score_loss, log_loss, mean_absolute_error
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
            default=0.75,
            help="Split decay factor (0-1). Default: 0.75",
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
        WINDOW = 10

        # In-memory ELO trackers keyed by (team_id, league_id)
        elo_tracker: dict[tuple, float] = defaultdict(lambda: 1500.0)
        elo_blue_tracker: dict[tuple, float] = defaultdict(lambda: 1500.0)
        elo_red_tracker: dict[tuple, float] = defaultdict(lambda: 1500.0)
        elo_matches_played: dict[tuple, int] = defaultdict(int)
        side_matches_blue: dict[tuple, int] = defaultdict(int)
        side_matches_red: dict[tuple, int] = defaultdict(int)

        # Split decay tracker
        team_last_split: dict[tuple, tuple] = {}

        rows = []
        for match in match_list:
            blue_id = match.blue_team_id
            red_id = match.red_team_id
            league_id = match.league_id

            blue_key = (blue_id, league_id)
            red_key = (red_id, league_id)

            blue_stat = stats_by_match.get(match.id, {}).get(blue_id)
            red_stat = stats_by_match.get(match.id, {}).get(red_id)
            if not blue_stat or not red_stat:
                continue

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

            if len(blue_hist) >= 3 and len(red_hist) >= 3:
                blue_features = self._compute_features_from_history(blue_hist)
                red_features = self._compute_features_from_history(red_hist)
                h2h_features = self._compute_h2h_from_history(blue_id, red_id, match_list, match)

                feature_keys = list(blue_features.keys())

                t1_vals = [blue_features[k] for k in feature_keys]
                t2_vals = [red_features[k] for k in feature_keys]

                diff_keys = [
                    "win_rate", "avg_kills", "avg_towers", "avg_dragons",
                    "avg_golddiffat10", "avg_golddiffat15",
                    "win_rate_last3", "win_rate_last5", "streak",
                ]
                diff_vals = [blue_features[k] - red_features[k] for k in diff_keys]

                h2h_vals = [
                    h2h_features["win_rate_vs"],
                    h2h_features["total_games_vs"],
                    h2h_features["recent_form_vs"],
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

                all_features = t1_vals + t2_vals + diff_vals + h2h_vals + elo_vals + t1_pos_vals + t2_pos_vals

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

            # Build player stats for this match record
            blue_player_list = player_stats_by_match.get(match.id, {}).get(blue_id, [])
            red_player_list = player_stats_by_match.get(match.id, {}).get(red_id, [])

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

        self.stdout.write(f"Built {len(rows)} training samples.")

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
                # Default parameters
                params = {
                    "n_estimators": 200,
                    "max_depth": 6,
                    "learning_rate": 0.1,
                    "num_leaves": 31,
                    "random_state": 42,
                    "verbosity": -1,
                }
                self.stdout.write(f"  {name}: training with default params...")
            else:
                # Optuna tuning
                self.stdout.write(f"  {name}: running Optuna tuning (50 trials)...")
                params = self._tune_with_optuna(
                    X_train, y_train, config["type"]
                )
                self.stdout.write(f"  {name}: best params = {params}")

            all_best_params[name] = params

            if config["type"] == "classification":
                model = LGBMClassifier(**params)
            else:
                model = LGBMRegressor(**params)

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
                brier = brier_score_loss(y_test, probs)
                logloss = log_loss(y_test, probs)
                self.stdout.write(
                    self.style.SUCCESS(
                        f"  {name}: Accuracy = {acc:.3f}, Brier = {brier:.4f}, "
                        f"LogLoss = {logloss:.4f} "
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
                brier = brier_score_loss(y_test, probs)
                logloss = log_loss(y_test, probs)
                self.stdout.write(
                    self.style.SUCCESS(
                        f"  {name}: Accuracy = {acc:.3f}, Brier = {brier:.4f}, "
                        f"LogLoss = {logloss:.4f} "
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

    def _tune_with_optuna(self, X_train, y_train, model_type: str) -> dict:
        """Run Optuna hyperparameter tuning with TimeSeriesSplit cross-validation."""
        import optuna
        from lightgbm import LGBMClassifier, LGBMRegressor

        optuna.logging.set_verbosity(optuna.logging.WARNING)

        tscv = TimeSeriesSplit(n_splits=3)

        def objective(trial):
            params = {
                "n_estimators": trial.suggest_int("n_estimators", 100, 500),
                "max_depth": trial.suggest_int("max_depth", 3, 10),
                "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.3, log=True),
                "num_leaves": trial.suggest_int("num_leaves", 15, 63),
                "min_child_samples": trial.suggest_int("min_child_samples", 5, 50),
                "subsample": trial.suggest_float("subsample", 0.6, 1.0),
                "colsample_bytree": trial.suggest_float("colsample_bytree", 0.6, 1.0),
                "reg_alpha": trial.suggest_float("reg_alpha", 1e-8, 10.0, log=True),
                "reg_lambda": trial.suggest_float("reg_lambda", 1e-8, 10.0, log=True),
                "random_state": 42,
                "verbosity": -1,
            }

            if model_type == "classification":
                model = LGBMClassifier(**params)
                scoring = "accuracy"
            else:
                model = LGBMRegressor(**params)
                scoring = "neg_mean_absolute_error"

            scores = cross_val_score(model, X_train, y_train, cv=tscv, scoring=scoring)
            return scores.mean()

        study = optuna.create_study(
            direction="maximize",
            sampler=optuna.samplers.TPESampler(seed=42),
        )
        study.optimize(objective, n_trials=50, show_progress_bar=False)

        best = study.best_params
        best["random_state"] = 42
        best["verbosity"] = -1
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
            "inhibitors": stat.inhibitors or 0,
            "first_blood": stat.first_blood,
            "first_tower": stat.first_tower,
            "first_dragon": stat.first_dragon,
            "first_herald": stat.first_herald,
            "golddiffat10": stat.golddiffat10 or 0.0,
            "golddiffat15": stat.golddiffat15 or 0.0,
            "game_length": match.game_length or 30.0,
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
            }

        t1_wins = sum(1 for m in h2h_matches if m.winner_id == team1_id)
        recent = h2h_matches[-5:]
        recent_wins = sum(1 for m in recent if m.winner_id == team1_id)

        return {
            "win_rate_vs": t1_wins / total,
            "total_games_vs": total,
            "recent_form_vs": recent_wins / len(recent),
        }
