"""Auto-update module for Oracle's Elixir data.

Downloads the latest CSV from Oracle's Elixir Google Drive and imports
new matches into the database on server startup.
"""

import logging
import os
import time
from datetime import datetime
from pathlib import Path

import pandas as pd
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

logger = logging.getLogger(__name__)

# Google Drive folder ID where Oracle's Elixir hosts downloadable match data.
GDRIVE_FOLDER_ID = "1gLSw0RLjBbtaNy0dgnGQDAZOHIgCe-HH"
GDRIVE_FOLDER_URL = f"https://drive.google.com/drive/folders/{GDRIVE_FOLDER_ID}"

# Default year to import (current year)
DEFAULT_YEAR = datetime.now().year

# Default leagues to import
DEFAULT_LEAGUES = ["LPL", "LCK", "CBLOL", "LCS"]

# League name aliases
LEAGUE_ALIASES = {
    "LTA S": "CBLOL",
}

# Batch size for bulk operations
BATCH_SIZE = 500


def auto_update_oracle_data(year: int = None, force_download: bool = True):
    """Download and import the latest Oracle's Elixir data.

    Args:
        year: Year to import (default: current year)
        force_download: If True, delete cached CSV and re-download
    """
    from analytics.models import (
        DataImportLog,
        League,
        Match,
        Player,
        PlayerMatchStats,
        Team,
        TeamMatchStats,
    )

    if year is None:
        year = DEFAULT_YEAR

    logger.info("=" * 60)
    logger.info("Starting Oracle's Elixir auto-update for year %d", year)
    logger.info("=" * 60)

    data_dir = Path("data")
    data_dir.mkdir(exist_ok=True)

    expected_filename = f"{year}_LoL_esports_match_data_from_OraclesElixir.csv"
    expected_path = data_dir / expected_filename

    # Delete cached file to force re-download if requested
    if force_download and expected_path.exists():
        logger.info("Removing cached CSV to force re-download: %s", expected_path)
        expected_path.unlink()

    # Download the CSV
    try:
        df = _download_csv(year, expected_path)
    except Exception as e:
        logger.error("Failed to download CSV: %s", e)
        return

    if df is None or df.empty:
        logger.warning("No data to import")
        return

    # Filter by leagues
    target_leagues = [lg.upper() for lg in DEFAULT_LEAGUES]

    # Add alias keys to target leagues
    for alias_key, canonical in LEAGUE_ALIASES.items():
        if canonical.upper() in target_leagues and alias_key.upper() not in target_leagues:
            target_leagues.append(alias_key.upper())

    if "league" in df.columns:
        before = len(df)
        df = df[df["league"].astype(str).str.upper().isin(target_leagues)]
        after = len(df)
        logger.info("League filter (%s): %d -> %d rows", ", ".join(target_leagues), before, after)

        # Apply league aliases
        if LEAGUE_ALIASES:
            alias_map = {k: v for k, v in LEAGUE_ALIASES.items()}
            mapped = df["league"].map(alias_map)
            replaced = mapped.notna()
            if replaced.any():
                df.loc[replaced, "league"] = mapped[replaced]

    # Create import log
    import_log = DataImportLog.objects.create(
        year=year,
        source=f"Auto-update from Google Drive (year={year})",
        status="processing",
    )

    try:
        _import_data(df, year, import_log)
        logger.info("Auto-update completed successfully")
    except Exception as e:
        import_log.status = "failed"
        import_log.errors = str(e)
        import_log.completed_at = timezone.now()
        import_log.save()
        logger.exception("Auto-update import failed: %s", e)


def _download_csv(year: int, expected_path: Path) -> pd.DataFrame:
    """Download the CSV for the given year from Google Drive."""
    import gdown

    # Ensure gdown cache directory exists (fixes Docker container issue)
    gdown_cache = Path.home() / ".cache" / "gdown"
    gdown_cache.mkdir(parents=True, exist_ok=True)

    # Use cached file if it exists
    if expected_path.exists():
        logger.info("Using cached CSV: %s", expected_path)
        df = pd.read_csv(str(expected_path), low_memory=False)
        logger.info("Loaded %d rows from cache", len(df))
        return df

    logger.info("Downloading CSV for year %d from Google Drive...", year)

    try:
        # List folder contents to find the right file
        gdrive_files = gdown.download_folder(
            url=GDRIVE_FOLDER_URL,
            skip_download=True,
            quiet=True,
        )
    except Exception as e:
        logger.error("Failed to list Google Drive folder: %s", e)
        raise

    # Find the file for this year
    target_file = None
    year_str = str(year)
    for f in gdrive_files:
        if year_str in f.path and f.path.endswith(".csv"):
            target_file = f
            break

    if target_file is None:
        available = [f.path for f in gdrive_files]
        raise FileNotFoundError(
            f"No file for year {year} found. Available: {available}"
        )

    logger.info("Found: %s (id=%s). Downloading...", target_file.path, target_file.id)

    # Download the file
    gdrive_url = f"https://drive.google.com/uc?id={target_file.id}"
    try:
        gdown.download(gdrive_url, str(expected_path), quiet=False)
    except Exception as e:
        logger.error("Failed to download file: %s", e)
        raise

    if not expected_path.exists():
        raise FileNotFoundError(f"Download succeeded but file not found at {expected_path}")

    logger.info("Downloaded successfully: %s", expected_path)
    df = pd.read_csv(str(expected_path), low_memory=False)
    logger.info("Loaded %d rows", len(df))
    return df


def _import_data(df: pd.DataFrame, year: int, import_log) -> None:
    """Import the DataFrame into the database."""
    from analytics.models import (
        League,
        Match,
        Player,
        PlayerMatchStats,
        Team,
        TeamMatchStats,
    )

    t_start = time.monotonic()

    # Drop rows without valid gameid
    df = df.dropna(subset=["gameid"])
    df = df[df["gameid"].astype(str).str.strip() != ""]

    # Fetch existing game IDs to skip duplicates
    existing_gameids = set(Match.objects.values_list("gameid", flat=True))
    logger.info("Found %d existing matches in database", len(existing_gameids))

    # Pre-load caches
    league_cache = {lg.slug: lg for lg in League.objects.all()}
    team_cache = {t.oe_teamid: t for t in Team.objects.all() if t.oe_teamid}
    player_cache = {p.oe_playerid: p for p in Player.objects.all() if p.oe_playerid}
    existing_league_slugs = set(league_cache.keys())
    existing_team_slugs = set(Team.objects.values_list("slug", flat=True))

    grouped = df.groupby("gameid")
    total_games = len(grouped)
    logger.info("Processing %d unique games...", total_games)

    matches_created = 0
    matches_skipped = 0
    rows_processed = 0
    error_messages = []

    team_stats_batch = []
    player_stats_batch = []

    for idx, (gameid, game_df) in enumerate(grouped, start=1):
        gameid_str = str(gameid).strip()
        rows_processed += len(game_df)

        # Skip already-imported games
        if gameid_str in existing_gameids:
            matches_skipped += 1
            continue

        try:
            match_obj, t_stats, p_stats = _process_game(
                gameid_str,
                game_df,
                year,
                league_cache,
                team_cache,
                player_cache,
                existing_league_slugs,
                existing_team_slugs,
            )
        except _SkipGame as e:
            matches_skipped += 1
            if str(e):
                error_messages.append(f"[{gameid_str}] {e}")
            continue
        except Exception as e:
            matches_skipped += 1
            error_messages.append(f"[{gameid_str}] Unexpected: {e}")
            continue

        team_stats_batch.extend(t_stats)
        player_stats_batch.extend(p_stats)
        existing_gameids.add(gameid_str)
        matches_created += 1

        # Flush batches periodically
        if len(team_stats_batch) >= BATCH_SIZE:
            TeamMatchStats.objects.bulk_create(team_stats_batch, ignore_conflicts=True)
            team_stats_batch.clear()
        if len(player_stats_batch) >= BATCH_SIZE:
            PlayerMatchStats.objects.bulk_create(player_stats_batch, ignore_conflicts=True)
            player_stats_batch.clear()

        # Progress log every 500 games
        if idx % 500 == 0:
            logger.info("Progress: %d/%d games (%d created, %d skipped)",
                       idx, total_games, matches_created, matches_skipped)

    # Flush remaining batches
    if team_stats_batch:
        TeamMatchStats.objects.bulk_create(team_stats_batch, ignore_conflicts=True)
    if player_stats_batch:
        PlayerMatchStats.objects.bulk_create(player_stats_batch, ignore_conflicts=True)

    elapsed = time.monotonic() - t_start

    # Update import log
    import_log.rows_processed = rows_processed
    import_log.matches_created = matches_created
    import_log.matches_skipped = matches_skipped
    import_log.errors = "\n".join(error_messages) if error_messages else ""
    import_log.status = "completed"
    import_log.completed_at = timezone.now()
    import_log.save()

    logger.info("=" * 60)
    logger.info("Import completed in %.1fs", elapsed)
    logger.info("  Rows processed : %d", rows_processed)
    logger.info("  Matches created: %d", matches_created)
    logger.info("  Matches skipped: %d", matches_skipped)
    logger.info("  Errors         : %d", len(error_messages))
    logger.info("=" * 60)


def _safe_int(value, default: int = 0) -> int:
    try:
        if pd.isna(value):
            return default
    except (TypeError, ValueError):
        pass
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _safe_float(value, default: float = 0.0) -> float:
    try:
        if pd.isna(value):
            return default
    except (TypeError, ValueError):
        pass
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_float_or_none(value):
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _safe_str(value, default: str = "") -> str:
    try:
        if pd.isna(value):
            return default
    except (TypeError, ValueError):
        pass
    return str(value).strip()


def _safe_bool(value, default: bool = False) -> bool:
    try:
        if pd.isna(value):
            return default
    except (TypeError, ValueError):
        pass
    try:
        return bool(int(value))
    except (TypeError, ValueError):
        return default


def _unique_slug(base: str, existing: set) -> str:
    slug = slugify(base)
    if not slug:
        slug = "unknown"
    candidate = slug
    counter = 2
    while candidate in existing:
        candidate = f"{slug}-{counter}"
        counter += 1
    return candidate


@transaction.atomic
def _process_game(
    gameid: str,
    game_df: pd.DataFrame,
    year: int,
    league_cache: dict,
    team_cache: dict,
    player_cache: dict,
    existing_league_slugs: set,
    existing_team_slugs: set,
):
    """Process a single game and create Match, TeamMatchStats, PlayerMatchStats."""
    from analytics.models import (
        League,
        Match,
        Player,
        PlayerMatchStats,
        Team,
        TeamMatchStats,
    )

    team_rows = game_df[game_df["position"] == "team"]
    player_rows = game_df[game_df["position"] != "team"]

    if len(team_rows) != 2:
        raise _SkipGame(f"Expected 2 team rows, found {len(team_rows)}")

    # League
    first_row = game_df.iloc[0]
    league_name = _safe_str(first_row.get("league"), default="Unknown")
    league_slug = slugify(league_name) or "unknown"

    if league_slug not in league_cache:
        final_slug = _unique_slug(league_name, existing_league_slugs)
        league_obj = League.objects.create(name=league_name, slug=final_slug)
        league_cache[final_slug] = league_obj
        existing_league_slugs.add(final_slug)
        league_cache[league_slug] = league_obj
    else:
        league_obj = league_cache[league_slug]

    # Teams
    teams_by_side = {}
    team_row_by_side = {}

    for _, t_row in team_rows.iterrows():
        side = _safe_str(t_row.get("side"))
        oe_teamid = _safe_str(t_row.get("teamid"))
        team_name = _safe_str(t_row.get("teamname"), default="Unknown")

        if oe_teamid and oe_teamid in team_cache:
            team_obj = team_cache[oe_teamid]
        else:
            team_slug = _unique_slug(team_name, existing_team_slugs)
            team_obj = Team.objects.create(
                name=team_name,
                slug=team_slug,
                oe_teamid=oe_teamid or None,
            )
            existing_team_slugs.add(team_slug)
            if oe_teamid:
                team_cache[oe_teamid] = team_obj

        team_obj.leagues.add(league_obj)
        teams_by_side[side] = team_obj
        team_row_by_side[side] = t_row

    blue_team = teams_by_side.get("Blue")
    red_team = teams_by_side.get("Red")

    if blue_team is None or red_team is None:
        raise _SkipGame("Could not determine Blue and Red teams")

    # Winner
    winner = None
    for side, t_row in team_row_by_side.items():
        if _safe_int(t_row.get("result")) == 1:
            winner = teams_by_side[side]
            break

    # Match metadata
    gamelength_sec = _safe_float(first_row.get("gamelength"))
    gamelength_min = gamelength_sec / 60.0 if gamelength_sec > 0 else None

    split = _safe_str(first_row.get("split"))
    patch = _safe_str(first_row.get("patch"))
    playoffs = _safe_bool(first_row.get("playoffs"))

    date_val = first_row.get("date")
    parsed_date = None
    if pd.notna(date_val):
        try:
            parsed_date = pd.to_datetime(date_val, utc=True)
        except Exception:
            pass

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

    # TeamMatchStats
    team_stats_list = []
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

    # PlayerMatchStats
    player_stats_list = []
    for _, p_row in player_rows.iterrows():
        oe_playerid = _safe_str(p_row.get("playerid"))
        player_name = _safe_str(p_row.get("playername"), default="Unknown")
        position = _safe_str(p_row.get("position"))
        oe_teamid = _safe_str(p_row.get("teamid"))

        player_team = team_cache.get(oe_teamid) if oe_teamid else None
        if player_team is None:
            side = _safe_str(p_row.get("side"))
            player_team = teams_by_side.get(side, blue_team)

        if oe_playerid and oe_playerid in player_cache:
            player_obj = player_cache[oe_playerid]
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

        kills = _safe_int(p_row.get("kills"))
        deaths = _safe_int(p_row.get("deaths"))
        assists = _safe_int(p_row.get("assists"))
        kda = (kills + assists) / max(deaths, 1)

        cs = _safe_float(p_row.get("total cs"))
        total_gold = _safe_float(p_row.get("totalgold"))
        damage = _safe_float(p_row.get("damagetochampions"))

        if gamelength_min and gamelength_min > 0:
            cs_per_min = cs / gamelength_min
            gold_per_min = total_gold / gamelength_min
            damage_per_min = damage / gamelength_min
        else:
            cs_per_min = gold_per_min = damage_per_min = 0.0

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

    return match_obj, team_stats_list, player_stats_list


class _SkipGame(Exception):
    """Raised to signal that a game should be skipped."""
    pass
