"""Management command to train XGBoost prediction models from match data."""

from collections import defaultdict

import joblib
import numpy as np
import pandas as pd
from django.core.management.base import BaseCommand
from sklearn.metrics import accuracy_score, mean_absolute_error

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
    help = "Train XGBoost prediction models from historical match data."

    def handle(self, *args, **options):
        self.stdout.write("Building training dataset...")

        matches = (
            Match.objects.filter(
                winner__isnull=False,
                game_length__isnull=False,
            )
            .select_related("blue_team", "red_team", "winner")
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

        # Build rolling features per team
        self.stdout.write("Computing rolling features...")
        team_history: dict[int, list[dict]] = defaultdict(list)
        team_last_roster: dict[int, frozenset] = {}
        team_roster_change_idx: dict[int, int] = defaultdict(int)
        WINDOW = 10

        rows = []
        for match in match_list:
            blue_id = match.blue_team_id
            red_id = match.red_team_id

            blue_stat = stats_by_match.get(match.id, {}).get(blue_id)
            red_stat = stats_by_match.get(match.id, {}).get(red_id)
            if not blue_stat or not red_stat:
                continue

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
                ]
                diff_vals = [blue_features[k] - red_features[k] for k in diff_keys]

                h2h_vals = [
                    h2h_features["win_rate_vs"],
                    h2h_features["total_games_vs"],
                    h2h_features["recent_form_vs"],
                ]

                # Per-position features
                blue_pos_features = self._compute_position_features_from_history(blue_hist)
                red_pos_features = self._compute_position_features_from_history(red_hist)

                pos_feature_keys = [
                    f"pos_{pos}_avg_{stat}" for pos in POSITIONS for stat in POSITION_STATS
                ]
                t1_pos_vals = [blue_pos_features[k] for k in pos_feature_keys]
                t2_pos_vals = [red_pos_features[k] for k in pos_feature_keys]

                all_features = t1_vals + t2_vals + diff_vals + h2h_vals + t1_pos_vals + t2_pos_vals

                # Targets
                team1_wins = 1 if match.winner_id == blue_id else 0

                # Combined stats
                total_kills = (blue_stat.kills or 0) + (red_stat.kills or 0)
                total_dragons = (blue_stat.dragons or 0) + (red_stat.dragons or 0)
                total_towers = (blue_stat.towers or 0) + (red_stat.towers or 0)
                game_time = match.game_length or 0

                rows.append({
                    "features": all_features,
                    "winner": team1_wins,
                    "total_kills": total_kills,
                    "total_dragons": total_dragons,
                    "total_towers": total_towers,
                    "game_time": game_time,
                })

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
        y_game_time = np.array([r["game_time"] for r in rows])

        # Temporal split: 80% train, 20% test
        split_idx = int(len(rows) * 0.8)
        X_train, X_test = X[:split_idx], X[split_idx:]
        self.stdout.write(f"Train: {len(X_train)}, Test: {len(X_test)}")

        # Ensure output directory exists
        ML_MODELS_DIR.mkdir(parents=True, exist_ok=True)

        # Train models
        from xgboost import XGBClassifier, XGBRegressor

        targets = {
            "winner": {
                "y": y_winner,
                "model": XGBClassifier(
                    n_estimators=200,
                    max_depth=6,
                    learning_rate=0.1,
                    use_label_encoder=False,
                    eval_metric="logloss",
                    random_state=42,
                ),
                "type": "classification",
            },
            "total_kills": {
                "y": y_kills,
                "model": XGBRegressor(
                    n_estimators=200, max_depth=6, learning_rate=0.1, random_state=42
                ),
                "type": "regression",
            },
            "total_dragons": {
                "y": y_dragons,
                "model": XGBRegressor(
                    n_estimators=200, max_depth=6, learning_rate=0.1, random_state=42
                ),
                "type": "regression",
            },
            "total_towers": {
                "y": y_towers,
                "model": XGBRegressor(
                    n_estimators=200, max_depth=6, learning_rate=0.1, random_state=42
                ),
                "type": "regression",
            },
            "game_time": {
                "y": y_game_time,
                "model": XGBRegressor(
                    n_estimators=200, max_depth=6, learning_rate=0.1, random_state=42
                ),
                "type": "regression",
            },
        }

        for name, config in targets.items():
            y_all = config["y"]
            y_train, y_test = y_all[:split_idx], y_all[split_idx:]

            model = config["model"]
            model.fit(X_train, y_train)

            model_path = ML_MODELS_DIR / f"{name}.joblib"
            joblib.dump(model, model_path)

            if config["type"] == "classification":
                preds = model.predict(X_test)
                acc = accuracy_score(y_test, preds)
                self.stdout.write(
                    self.style.SUCCESS(f"  {name}: Accuracy = {acc:.3f} -> {model_path}")
                )
            else:
                preds = model.predict(X_test)
                mae = mean_absolute_error(y_test, preds)
                self.stdout.write(
                    self.style.SUCCESS(f"  {name}: MAE = {mae:.3f} -> {model_path}")
                )

        clear_model_cache()
        self.stdout.write(self.style.SUCCESS("All models trained and saved."))

    def _match_to_record(
        self, stat: TeamMatchStats, match: Match, player_stats: list | None = None
    ) -> dict:
        """Convert a TeamMatchStats + Match into a dict record for rolling history."""
        record = {
            "is_winner": stat.is_winner,
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
