"""Management command to import Oracle's Elixir CSV data into the database.

Downloads or reads Oracle's Elixir match data CSVs and creates the
corresponding League, Team, Player, Match, TeamMatchStats, and
PlayerMatchStats records while avoiding duplicates.

Usage examples:
    # Download 2026 data from Oracle's Elixir Google Drive and import
    python manage.py import_oracle_data --year 2026 --download

    # Import from a local CSV file
    python manage.py import_oracle_data --year 2026 --file data/2026_LoL_esports_match_data_from_OraclesElixir.csv
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import pandas as pd
from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from analytics.models import (
    DataImportLog,
    League,
    LiveMatchSnapshot,
    Match,
    Player,
    PlayerMatchStats,
    Team,
    TeamMatchStats,
)

# Google Drive folder ID where Oracle's Elixir hosts downloadable match data.
GDRIVE_FOLDER_ID: str = "1gLSw0RLjBbtaNy0dgnGQDAZOHIgCe-HH"
GDRIVE_FOLDER_URL: str = f"https://drive.google.com/drive/folders/{GDRIVE_FOLDER_ID}"

# Number of records per bulk_create batch.
BATCH_SIZE: int = 500

# Default leagues to import when --leagues is not specified.
DEFAULT_LEAGUES: list[str] = ["LPL", "LCK", "CBLOL", "LCS"]

# Aliases: CSV league names that should be mapped to a canonical name.
# The alias key (uppercase) is also included in the filter automatically.
LEAGUE_ALIASES: dict[str, str] = {
    "LTA S": "CBLOL",
}


def _safe_int(value: Any, default: int = 0) -> int:
    """Convert a value to int, returning *default* when it is NaN or missing."""
    try:
        if pd.isna(value):
            return default
    except (TypeError, ValueError):
        pass
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _safe_float(value: Any, default: float = 0.0) -> float:
    """Convert a value to float, returning *default* when it is NaN or missing."""
    try:
        if pd.isna(value):
            return default
    except (TypeError, ValueError):
        pass
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_float_or_none(value: Any) -> float | None:
    """Convert a value to float, returning None when it is NaN or missing."""
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _safe_str(value: Any, default: str = "") -> str:
    """Convert a value to str, returning *default* when it is NaN or missing."""
    try:
        if pd.isna(value):
            return default
    except (TypeError, ValueError):
        pass
    return str(value).strip()


def _safe_bool(value: Any, default: bool = False) -> bool:
    """Convert a value to bool, treating 1 / 1.0 as True."""
    try:
        if pd.isna(value):
            return default
    except (TypeError, ValueError):
        pass
    try:
        return bool(int(value))
    except (TypeError, ValueError):
        return default


def _unique_slug(base: str, existing: set[str]) -> str:
    """Generate a unique slug by appending a numeric suffix when needed."""
    slug = slugify(base)
    if not slug:
        slug = "unknown"
    candidate = slug
    counter = 2
    while candidate in existing:
        candidate = f"{slug}-{counter}"
        counter += 1
    return candidate


class Command(BaseCommand):
    help = "Import Oracle's Elixir CSV match data into the database."

    # ------------------------------------------------------------------ CLI
    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--year",
            type=int,
            required=True,
            help="Year of the data to import (e.g. 2025).",
        )
        parser.add_argument(
            "--file",
            type=str,
            default=None,
            help="Path to a local CSV file to import.",
        )
        parser.add_argument(
            "--download",
            action="store_true",
            default=False,
            help="Download the CSV from Oracle's Elixir Google Drive folder.",
        )
        parser.add_argument(
            "--leagues",
            nargs="*",
            default=None,
            help=(
                "League names to import (case-insensitive). "
                f"Default: {', '.join(DEFAULT_LEAGUES)}. "
                "Use --all-leagues to import everything."
            ),
        )
        parser.add_argument(
            "--all-leagues",
            action="store_true",
            default=False,
            help="Import all leagues (skip league filtering).",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            default=False,
            help="Force re-download by deleting cached CSV file first.",
        )

    # --------------------------------------------------------------- handle
    def handle(self, *args: Any, **options: Any) -> None:
        year: int = options["year"]
        file_path: str | None = options["file"]
        download: bool = options["download"]
        force: bool = options["force"]

        if not file_path and not download:
            raise CommandError(
                "You must provide either --file with a local CSV path "
                "or --download to fetch from Oracle's Elixir Google Drive."
            )

        if file_path and download:
            raise CommandError(
                "Provide only one of --file or --download, not both."
            )

        # Determine source label for the log entry.
        if download:
            source = f"Google Drive folder {GDRIVE_FOLDER_ID} (year={year})"
        else:
            source = str(file_path)

        # Create the import log entry.
        import_log = DataImportLog.objects.create(
            year=year,
            source=source,
            status="processing",
        )

        # Determine target leagues for filtering.
        all_leagues: bool = options["all_leagues"]
        leagues_arg: list[str] | None = options["leagues"]

        if all_leagues:
            target_leagues: list[str] | None = None
        elif leagues_arg is not None:
            target_leagues = [lg.upper() for lg in leagues_arg]
        else:
            target_leagues = [lg.upper() for lg in DEFAULT_LEAGUES]

        # Expand target leagues with alias keys so the CSV filter matches them.
        if target_leagues is not None:
            alias_upper = {k.upper(): v for k, v in LEAGUE_ALIASES.items()}
            for alias_key, canonical in alias_upper.items():
                if canonical.upper() in target_leagues and alias_key not in target_leagues:
                    target_leagues.append(alias_key)

        try:
            df = self._load_csv(year, file_path, download, force)

            # Filter by league before processing.
            if target_leagues is not None:
                if "league" not in df.columns:
                    raise CommandError(
                        "CSV does not contain a 'league' column. "
                        "Cannot filter by league."
                    )
                before = len(df)
                df = df[df["league"].astype(str).str.upper().isin(target_leagues)]
                after = len(df)
                self.stdout.write(
                    f"League filter ({', '.join(target_leagues)}): "
                    f"{before} -> {after} rows "
                    f"({before - after} rows excluded)."
                )
            else:
                self.stdout.write("Importing ALL leagues (no filter).")

            # Apply league name aliases (e.g. "LTA S" -> "CBLOL").
            if "league" in df.columns and LEAGUE_ALIASES:
                alias_map = {k: v for k, v in LEAGUE_ALIASES.items()}
                mapped = df["league"].map(alias_map)
                replaced = mapped.notna()
                if replaced.any():
                    count = replaced.sum()
                    originals = df.loc[replaced, "league"].unique().tolist()
                    df.loc[replaced, "league"] = mapped[replaced]
                    self.stdout.write(
                        f"League aliases applied: {originals} -> "
                        f"{[alias_map[o] for o in originals]} ({count} rows remapped)."
                    )

            self._import_data(df, year, import_log)
        except Exception as exc:
            import_log.status = "failed"
            import_log.errors = str(exc)
            import_log.completed_at = timezone.now()
            import_log.save()
            raise CommandError(f"Import failed: {exc}") from exc

    # ----------------------------------------------------------- CSV loading
    def _load_csv(
        self,
        year: int,
        file_path: str | None,
        download: bool,
        force: bool = False,
    ) -> pd.DataFrame:
        """Load the CSV into a pandas DataFrame."""
        if download:
            df = self._download_from_gdrive(year, force=force)
        else:
            resolved = Path(file_path).resolve()  # type: ignore[arg-type]
            if not resolved.exists():
                raise FileNotFoundError(f"File not found: {resolved}")
            self.stdout.write(f"Reading local file {resolved} ...")
            df = pd.read_csv(str(resolved), low_memory=False)
            self.stdout.write(
                self.style.SUCCESS(f"File loaded. {len(df)} rows read.")
            )

        # Drop rows without a valid gameid.
        df = df.dropna(subset=["gameid"])
        df = df[df["gameid"].astype(str).str.strip() != ""]
        self.stdout.write(f"{len(df)} rows with valid gameid.")

        return df

    def _download_from_gdrive(self, year: int, force: bool = False) -> pd.DataFrame:
        """Download only the CSV for the given year from Google Drive."""
        import os

        # Ensure gdown cache directory exists (fixes Docker container issue)
        # Must be done BEFORE importing gdown
        try:
            gdown_cache = Path.home() / ".cache" / "gdown"
            gdown_cache.mkdir(parents=True, exist_ok=True)
        except PermissionError:
            os.environ["HOME"] = "/tmp"
            gdown_cache = Path("/tmp") / ".cache" / "gdown"
            gdown_cache.mkdir(parents=True, exist_ok=True)

        import gdown

        data_dir = Path("data")
        data_dir.mkdir(exist_ok=True)

        # Expected filename pattern from Oracle's Elixir.
        expected_filename = (
            f"{year}_LoL_esports_match_data_from_OraclesElixir.csv"
        )
        expected_path = data_dir / expected_filename

        # Delete cached file if force is True
        if force and expected_path.exists():
            self.stdout.write(
                f"Force flag set. Deleting cached file: {expected_path}"
            )
            expected_path.unlink()

        # Use cached file if it already exists locally.
        if expected_path.exists():
            self.stdout.write(
                f"Found cached file at {expected_path}, using it. "
                f"Use --force to re-download."
            )
            df = pd.read_csv(str(expected_path), low_memory=False)
            self.stdout.write(
                self.style.SUCCESS(f"File loaded. {len(df)} rows read.")
            )
            return df

        # List folder contents without downloading to find the right file.
        self.stdout.write(
            f"Listing Google Drive folder to find {year} data ..."
        )
        try:
            gdrive_files = gdown.download_folder(
                url=GDRIVE_FOLDER_URL,
                skip_download=True,
                quiet=True,
            )
        except Exception as exc:
            raise RuntimeError(
                f"Failed to list Google Drive folder: {exc}. "
                f"Download manually from {GDRIVE_FOLDER_URL} and use --file."
            ) from exc

        # Find the file matching this year.
        target_file = None
        year_str = str(year)
        for f in gdrive_files:
            if year_str in f.path and f.path.endswith(".csv"):
                target_file = f
                break

        if target_file is None:
            available = [f.path for f in gdrive_files]
            raise FileNotFoundError(
                f"No file for year {year} found in Google Drive folder. "
                f"Available files: {', '.join(available)}. "
                f"Download manually from {GDRIVE_FOLDER_URL} and use --file."
            )

        self.stdout.write(
            f"Found: {target_file.path} (id={target_file.id}). "
            f"Downloading ..."
        )

        # Download only this single file.
        gdrive_url = f"https://drive.google.com/uc?id={target_file.id}"
        output_path = str(expected_path)
        try:
            gdown.download(gdrive_url, output_path, quiet=False)
        except Exception as exc:
            raise RuntimeError(
                f"Failed to download {target_file.path}: {exc}. "
                f"Download manually from {GDRIVE_FOLDER_URL} and use --file."
            ) from exc

        if not expected_path.exists():
            raise FileNotFoundError(
                f"Download seemed to succeed but file not found at "
                f"{expected_path}. Download manually and use --file."
            )

        self.stdout.write(
            self.style.SUCCESS(f"Downloaded {expected_filename}.")
        )
        df = pd.read_csv(str(expected_path), low_memory=False)
        self.stdout.write(
            self.style.SUCCESS(f"{len(df)} rows loaded.")
        )
        return df

    # --------------------------------------------------------- main pipeline
    def _import_data(
        self,
        df: pd.DataFrame,
        year: int,
        import_log: DataImportLog,
    ) -> None:
        """Process the DataFrame and persist records to the database."""
        t_start = time.monotonic()

        # Fetch existing game IDs so we can skip duplicates.
        existing_gameids: set[str] = set(
            Match.objects.values_list("gameid", flat=True)
        )
        self.stdout.write(
            f"{len(existing_gameids)} existing matches found in database."
        )

        # Pre-load caches for get_or_create efficiency.
        league_cache: dict[str, League] = {
            lg.slug: lg for lg in League.objects.all()
        }
        team_cache: dict[str, Team] = {
            t.oe_teamid: t
            for t in Team.objects.all()
            if t.oe_teamid
        }
        player_cache: dict[str, Player] = {
            p.oe_playerid: p
            for p in Player.objects.all()
            if p.oe_playerid
        }

        # Collect existing slugs for uniqueness checks.
        existing_league_slugs: set[str] = set(league_cache.keys())
        existing_team_slugs: set[str] = set(
            Team.objects.values_list("slug", flat=True)
        )

        grouped = df.groupby("gameid")
        total_games = len(grouped)
        self.stdout.write(f"Processing {total_games} unique games ...")

        matches_created = 0
        matches_skipped = 0
        rows_processed = 0
        error_messages: list[str] = []

        # Accumulation lists for bulk_create.
        team_stats_batch: list[TeamMatchStats] = []
        player_stats_batch: list[PlayerMatchStats] = []

        for idx, (gameid, game_df) in enumerate(grouped, start=1):
            gameid_str = str(gameid).strip()
            rows_processed += len(game_df)

            # Skip already-imported games.
            if gameid_str in existing_gameids:
                matches_skipped += 1
                continue

            try:
                match_obj, t_stats, p_stats = self._process_game(
                    gameid_str,
                    game_df,
                    year,
                    league_cache,
                    team_cache,
                    player_cache,
                    existing_league_slugs,
                    existing_team_slugs,
                )
            except _SkipGame as exc:
                matches_skipped += 1
                if str(exc):
                    error_messages.append(f"[{gameid_str}] {exc}")
                continue
            except Exception as exc:
                matches_skipped += 1
                error_messages.append(f"[{gameid_str}] Unexpected: {exc}")
                continue

            team_stats_batch.extend(t_stats)
            player_stats_batch.extend(p_stats)
            existing_gameids.add(gameid_str)
            matches_created += 1

            # Flush bulk batches periodically.
            if len(team_stats_batch) >= BATCH_SIZE:
                TeamMatchStats.objects.bulk_create(team_stats_batch, ignore_conflicts=True)
                team_stats_batch.clear()
            if len(player_stats_batch) >= BATCH_SIZE:
                PlayerMatchStats.objects.bulk_create(player_stats_batch, ignore_conflicts=True)
                player_stats_batch.clear()

            # Progress indicator every 500 games.
            if idx % 500 == 0:
                self.stdout.write(
                    f"  ... processed {idx}/{total_games} games "
                    f"({matches_created} created, {matches_skipped} skipped)"
                )

        # Flush remaining batches.
        if team_stats_batch:
            TeamMatchStats.objects.bulk_create(team_stats_batch, ignore_conflicts=True)
        if player_stats_batch:
            PlayerMatchStats.objects.bulk_create(player_stats_batch, ignore_conflicts=True)

        elapsed = time.monotonic() - t_start

        # Update the import log.
        import_log.rows_processed = rows_processed
        import_log.matches_created = matches_created
        import_log.matches_skipped = matches_skipped
        import_log.errors = "\n".join(error_messages) if error_messages else ""
        import_log.status = "completed"
        import_log.completed_at = timezone.now()
        import_log.save()

        # Clean up old snapshots (>30 days) that were never matched
        from datetime import timedelta as td

        old_cutoff = timezone.now() - td(days=30)
        old_snaps = LiveMatchSnapshot.objects.filter(created_at__lt=old_cutoff)
        old_count = old_snaps.count()
        if old_count > 0:
            old_snaps.delete()
            self.stdout.write(f"  Cleaned up {old_count} old LiveMatchSnapshots (>30 days).")

        remaining_snaps = LiveMatchSnapshot.objects.count()
        self.stdout.write(
            self.style.SUCCESS(
                f"\nImport completed in {elapsed:.1f}s.\n"
                f"  Rows processed : {rows_processed}\n"
                f"  Matches created: {matches_created}\n"
                f"  Matches skipped: {matches_skipped}\n"
                f"  Errors         : {len(error_messages)}\n"
                f"  Live snapshots remaining: {remaining_snaps}"
            )
        )

    # -------------------------------------------------- per-game processing
    @transaction.atomic
    def _process_game(
        self,
        gameid: str,
        game_df: pd.DataFrame,
        year: int,
        league_cache: dict[str, League],
        team_cache: dict[str, Team],
        player_cache: dict[str, Player],
        existing_league_slugs: set[str],
        existing_team_slugs: set[str],
    ) -> tuple[Match, list[TeamMatchStats], list[PlayerMatchStats]]:
        """Create Match, TeamMatchStats, and PlayerMatchStats for one game.

        Returns the Match object and the stat objects (not yet persisted via
        bulk_create -- the caller accumulates them).

        Raises _SkipGame when the game data is invalid or incomplete.
        """
        # Separate team summary rows from player rows.
        team_rows = game_df[game_df["position"] == "team"]
        player_rows = game_df[game_df["position"] != "team"]

        if len(team_rows) != 2:
            raise _SkipGame(
                f"Expected 2 team rows, found {len(team_rows)}."
            )

        # --- League -----------------------------------------------------------
        first_row = game_df.iloc[0]
        league_name = _safe_str(first_row.get("league"), default="Unknown")
        league_slug = slugify(league_name) or "unknown"

        if league_slug not in league_cache:
            # Ensure slug uniqueness.
            final_slug = _unique_slug(league_name, existing_league_slugs)
            league_obj = League.objects.create(
                name=league_name,
                slug=final_slug,
            )
            league_cache[final_slug] = league_obj
            existing_league_slugs.add(final_slug)
            league_cache[league_slug] = league_obj
        else:
            league_obj = league_cache[league_slug]

        # --- Teams ------------------------------------------------------------
        teams_by_side: dict[str, Team] = {}
        team_row_by_side: dict[str, pd.Series] = {}

        for _, t_row in team_rows.iterrows():
            side = _safe_str(t_row.get("side"))
            oe_teamid = _safe_str(t_row.get("teamid"))
            team_name = _safe_str(t_row.get("teamname"), default="Unknown")

            if oe_teamid and oe_teamid in team_cache:
                team_obj = team_cache[oe_teamid]
            else:
                # Create a new Team.
                team_slug = _unique_slug(team_name, existing_team_slugs)
                team_obj = Team.objects.create(
                    name=team_name,
                    slug=team_slug,
                    oe_teamid=oe_teamid or None,
                )
                existing_team_slugs.add(team_slug)
                if oe_teamid:
                    team_cache[oe_teamid] = team_obj

            # Attach league to team (M2M).
            team_obj.leagues.add(league_obj)

            teams_by_side[side] = team_obj
            team_row_by_side[side] = t_row

        blue_team = teams_by_side.get("Blue")
        red_team = teams_by_side.get("Red")

        if blue_team is None or red_team is None:
            raise _SkipGame("Could not determine Blue and Red teams.")

        # --- Winner -----------------------------------------------------------
        winner: Team | None = None
        for side, t_row in team_row_by_side.items():
            if _safe_int(t_row.get("result")) == 1:
                winner = teams_by_side[side]
                break

        # --- Match metadata ---------------------------------------------------
        gamelength_sec = _safe_float(first_row.get("gamelength"))
        gamelength_min = gamelength_sec / 60.0 if gamelength_sec > 0 else None

        split = _safe_str(first_row.get("split"))
        patch = _safe_str(first_row.get("patch"))
        playoffs = _safe_bool(first_row.get("playoffs"))

        # Parse date; Oracle's Elixir typically uses ISO-ish date strings.
        date_val = first_row.get("date")
        parsed_date = None
        if pd.notna(date_val):
            try:
                parsed_date = pd.to_datetime(date_val, utc=True)
            except Exception:
                parsed_date = None

        match_obj = Match.objects.create(
            gameid=gameid,
            league=league_obj,
            year=year,
            split=split,
            patch=patch,
            date=parsed_date,
            blue_team=blue_team,
            red_team=red_team,
            winner=winner,
            game_length=gamelength_min,
            playoffs=playoffs,
        )

        # --- TeamMatchStats ---------------------------------------------------
        team_stats_list: list[TeamMatchStats] = []

        for side, t_row in team_row_by_side.items():
            team_obj = teams_by_side[side]
            is_winner = _safe_int(t_row.get("result")) == 1

            team_stats_list.append(
                TeamMatchStats(
                    match=match_obj,
                    team=team_obj,
                    side=side,
                    is_winner=is_winner,
                    kills=_safe_int(t_row.get("kills")),
                    deaths=_safe_int(t_row.get("deaths")),
                    assists=_safe_int(t_row.get("assists")),
                    total_gold=_safe_float(t_row.get("totalgold")),
                    dragons=_safe_int(t_row.get("dragons")),
                    barons=_safe_int(t_row.get("barons")),
                    towers=_safe_int(t_row.get("towers")),
                    heralds=_safe_int(t_row.get("heralds")),
                    voidgrubs=_safe_int(t_row.get("void_grubs")),
                    inhibitors=_safe_int(t_row.get("inhibitors")),
                    first_blood=_safe_bool(t_row.get("firstblood")),
                    first_dragon=_safe_bool(t_row.get("firstdragon")),
                    first_herald=_safe_bool(t_row.get("firstherald")),
                    first_baron=_safe_bool(t_row.get("firstbaron")),
                    first_tower=_safe_bool(t_row.get("firsttower")),
                    first_inhibitor=_safe_bool(t_row.get("firstinhibitor")),
                    golddiffat10=_safe_float_or_none(t_row.get("golddiffat10")),
                    golddiffat15=_safe_float_or_none(t_row.get("golddiffat15")),
                    xpdiffat10=_safe_float_or_none(t_row.get("xpdiffat10")),
                    xpdiffat15=_safe_float_or_none(t_row.get("xpdiffat15")),
                    csdiffat10=_safe_float_or_none(t_row.get("csdiffat10")),
                    csdiffat15=_safe_float_or_none(t_row.get("csdiffat15")),
                )
            )

        # --- PlayerMatchStats -------------------------------------------------
        player_stats_list: list[PlayerMatchStats] = []

        for _, p_row in player_rows.iterrows():
            oe_playerid = _safe_str(p_row.get("playerid"))
            player_name = _safe_str(p_row.get("playername"), default="Unknown")
            position = _safe_str(p_row.get("position"))
            oe_teamid = _safe_str(p_row.get("teamid"))

            # Resolve the team for this player row.
            player_team = team_cache.get(oe_teamid) if oe_teamid else None
            if player_team is None:
                # Fallback: infer from the side.
                side = _safe_str(p_row.get("side"))
                player_team = teams_by_side.get(side, blue_team)

            # Get or create Player.
            if oe_playerid and oe_playerid in player_cache:
                player_obj = player_cache[oe_playerid]
                # Update team and position to the latest data.
                changed = False
                if player_obj.team_id != player_team.pk:
                    player_obj.team = player_team
                    changed = True
                if position and player_obj.position != position:
                    player_obj.position = position
                    changed = True
                if changed:
                    player_obj.save(update_fields=["team", "position"])
            else:
                player_obj = Player.objects.create(
                    name=player_name,
                    oe_playerid=oe_playerid or None,
                    position=position or "mid",
                    team=player_team,
                )
                if oe_playerid:
                    player_cache[oe_playerid] = player_obj

            # Compute derived stats.
            kills = _safe_int(p_row.get("kills"))
            deaths = _safe_int(p_row.get("deaths"))
            assists = _safe_int(p_row.get("assists"))
            kda = (kills + assists) / max(deaths, 1)

            # Handle the "total cs" column (note the space in the column name).
            cs = _safe_float(p_row.get("total cs"))
            total_gold = _safe_float(p_row.get("totalgold"))
            damage = _safe_float(p_row.get("damagetochampions"))

            # Per-minute stats.
            if gamelength_min and gamelength_min > 0:
                cs_per_min = cs / gamelength_min
                gold_per_min = total_gold / gamelength_min
                damage_per_min = damage / gamelength_min
            else:
                cs_per_min = 0.0
                gold_per_min = 0.0
                damage_per_min = 0.0

            champion = _safe_str(p_row.get("champion"))
            vision_score = _safe_float(p_row.get("visionscore"))
            wards_placed = _safe_int(p_row.get("wardsplaced"))
            wards_destroyed = _safe_int(p_row.get("wardskilled"))

            player_stats_list.append(
                PlayerMatchStats(
                    match=match_obj,
                    player=player_obj,
                    team=player_team,
                    position=position,
                    champion=champion,
                    kills=kills,
                    deaths=deaths,
                    assists=assists,
                    cs=cs,
                    total_gold=total_gold,
                    damage_to_champions=damage,
                    vision_score=vision_score,
                    wards_placed=wards_placed,
                    wards_destroyed=wards_destroyed,
                    kda=round(kda, 2),
                    cs_per_min=round(cs_per_min, 2),
                    gold_per_min=round(gold_per_min, 2),
                    damage_per_min=round(damage_per_min, 2),
                )
            )

        # Try to match and clean up LiveMatchSnapshot for this game
        blue_kills = 0
        red_kills = 0
        for ts in team_stats_list:
            if ts.side == "Blue":
                blue_kills = ts.kills
            elif ts.side == "Red":
                red_kills = ts.kills
        self._cleanup_live_snapshot(
            match_obj, blue_team, red_team, parsed_date,
            blue_kills, red_kills,
        )

        return match_obj, team_stats_list, player_stats_list

    def _cleanup_live_snapshot(
        self,
        match_obj: Match,
        blue_team: Team,
        red_team: Team,
        match_date,
        blue_kills: int,
        red_kills: int,
    ) -> None:
        """Find and delete LiveMatchSnapshot that corresponds to this Oracle game.

        Matching strategy (all conditions must be true):
        1. Same teams (either side orientation) via DB IDs
        2. Date within ±24 hours
        3. Kill counts match within ±2 per side (live stats may differ slightly)

        This ensures correct matching even in Bo5 series where multiple games
        between the same teams happen on the same day.
        """
        from datetime import timedelta

        from django.db.models import Q

        if not match_date:
            return

        blue_id = blue_team.pk
        red_id = red_team.pk

        date_min = match_date - timedelta(hours=24)
        date_max = match_date + timedelta(hours=24)

        # Find snapshots between these two teams (either orientation) near this date
        candidates = LiveMatchSnapshot.objects.filter(
            match_date__range=(date_min, date_max),
        ).filter(
            Q(blue_team_db_id=blue_id, red_team_db_id=red_id)
            | Q(blue_team_db_id=red_id, red_team_db_id=blue_id)
        )

        for snap in candidates:
            if not snap.final_stats:
                continue

            # Determine kill counts based on team orientation
            if snap.blue_team_db_id == blue_id:
                # Same orientation: snap blue = oracle blue
                snap_blue_kills = snap.final_stats.get("blue_kills", 0)
                snap_red_kills = snap.final_stats.get("red_kills", 0)
            else:
                # Swapped: snap blue = oracle red
                snap_blue_kills = snap.final_stats.get("red_kills", 0)
                snap_red_kills = snap.final_stats.get("blue_kills", 0)

            # Match if kills are close (live data may lag by 1-2 kills)
            if (
                abs(snap_blue_kills - blue_kills) <= 2
                and abs(snap_red_kills - red_kills) <= 2
            ):
                self.stdout.write(
                    f"  Matched LiveMatchSnapshot {snap.esports_game_id} "
                    f"-> Oracle game {match_obj.gameid} "
                    f"(kills: snap={snap_blue_kills}/{snap_red_kills}, "
                    f"oracle={blue_kills}/{red_kills}). Deleting snapshot."
                )
                snap.delete()
                return

        # No match found - that's fine, snapshot may not exist for this game


class _SkipGame(Exception):
    """Raised internally to signal that a game should be skipped."""
