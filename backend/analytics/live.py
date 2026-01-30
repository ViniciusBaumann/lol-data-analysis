"""Live games module: fetches in-progress LoL Esports matches, retrieves
champion picks and live stats via livestats, maps champion IDs to names via
Data Dragon, matches teams to the local DB, and runs draft predictions."""

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone

import requests as http_requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)

# Max workers for concurrent HTTP requests
MAX_WORKERS = 10

LOL_ESPORTS_API_KEY = "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z"
LOL_ESPORTS_BASE_URL = "https://esports-api.lolesports.com/persisted/gw"
LIVESTATS_BASE_URL = "https://feed.lolesports.com/livestats/v1"

# Reusable HTTP session with connection pooling and retries
_http_session: http_requests.Session | None = None

# Simple in-memory cache for live events (to reduce polling overhead)
_live_events_cache: dict = {"data": None, "timestamp": None}
_CACHE_TTL_SECONDS = 2  # Cache live events for 2 seconds (detail page polls every 5s)

# Persistent state cache for live game data (survives between requests)
# Key: game_id, Value: {"live_stats": {...}, "players": {...}, "last_updated": datetime}
_live_game_state_cache: dict[str, dict] = {}

# Cache for game start timestamps (first frame timestamp for accurate game time)
# Key: game_id, Value: {"first_timestamp": str, "fetched_at": datetime}
_game_start_cache: dict[str, dict] = {}


def _get_http_session() -> http_requests.Session:
    """Get or create a reusable HTTP session with connection pooling."""
    global _http_session
    if _http_session is None:
        _http_session = http_requests.Session()
        retry_strategy = Retry(
            total=2,
            backoff_factor=0.1,
            status_forcelist=[500, 502, 503, 504],
        )
        adapter = HTTPAdapter(
            pool_connections=10,
            pool_maxsize=20,
            max_retries=retry_strategy,
        )
        _http_session.mount("https://", adapter)
        _http_session.mount("http://", adapter)
    return _http_session

ROLE_MAP = {
    "top": "top",
    "jungle": "jng",
    "mid": "mid",
    "bottom": "bot",
    "support": "sup",
}

# ---------------------------------------------------------------------------
# Data Dragon caches
# ---------------------------------------------------------------------------

_champion_id_to_name: dict[int, str] = {}  # 103 -> "Ahri"
_champion_id_to_key: dict[int, str] = {}  # 103 -> "Ahri", 62 -> "MonkeyKing"
_champion_key_to_name: dict[str, str] = {}  # "MonkeyKing" -> "Wukong"
_ddragon_version: str = ""


def _ensure_champion_map() -> None:
    global _ddragon_version
    if _champion_id_to_name:
        return

    try:
        session = _get_http_session()
        versions_resp = session.get(
            "https://ddragon.leagueoflegends.com/api/versions.json",
            timeout=8,
        )
        versions_resp.raise_for_status()
        _ddragon_version = versions_resp.json()[0]

        champ_resp = session.get(
            f"https://ddragon.leagueoflegends.com/cdn/{_ddragon_version}/data/en_US/champion.json",
            timeout=8,
        )
        champ_resp.raise_for_status()
        data = champ_resp.json().get("data", {})

        for dict_key, champ_info in data.items():
            cid = int(champ_info["key"])
            display_name = champ_info["name"]
            _champion_id_to_name[cid] = display_name
            _champion_id_to_key[cid] = dict_key
            _champion_key_to_name[dict_key] = display_name

        logger.info(
            "Data Dragon loaded: %d champions (patch %s)",
            len(_champion_id_to_name),
            _ddragon_version,
        )
    except Exception:
        logger.exception("Failed to load Data Dragon champion map")


def _resolve_champion(champion_id) -> str | None:
    """Resolve a championId (numeric ID or Data Dragon key string) to display name."""
    if champion_id is None:
        return None
    # Try numeric ID first
    try:
        return _champion_id_to_name.get(int(champion_id))
    except (ValueError, TypeError):
        pass
    # Try Data Dragon dict key (e.g. "MonkeyKing" -> "Wukong", "KSante" -> "K'Sante")
    key = str(champion_id)
    name = _champion_key_to_name.get(key)
    if name:
        return name
    # Fallback: return the raw string
    return key


def _resolve_champion_key(champion_id) -> str | None:
    """Resolve a championId to its Data Dragon dict key (for image URLs).

    E.g. 103 -> "Ahri", "MonkeyKing" -> "MonkeyKing" (unchanged).
    """
    if champion_id is None:
        return None
    try:
        key = _champion_id_to_key.get(int(champion_id))
        if key:
            return key
    except (ValueError, TypeError):
        pass
    key = str(champion_id)
    if key in _champion_key_to_name:
        return key
    return key


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_starting_time() -> str:
    """ISO-8601 timestamp rounded to 10s, minus 60s for livestats startingTime."""
    now = datetime.now(timezone.utc)
    seconds = now.second - (now.second % 10)
    rounded = now.replace(second=seconds, microsecond=0)
    starting = rounded - timedelta(seconds=60)
    return starting.strftime("%Y-%m-%dT%H:%M:%SZ")


def _dragons_count(team_frame: dict) -> int:
    dragons = team_frame.get("dragons", [])
    if isinstance(dragons, list):
        return len(dragons)
    if isinstance(dragons, (int, float)):
        return int(dragons)
    return 0


# ---------------------------------------------------------------------------
# Fetch live events from LoL Esports API
# ---------------------------------------------------------------------------


def _fetch_event_details(match_id: str) -> dict | None:
    """Fetch detailed event info including accurate game states."""
    try:
        session = _get_http_session()
        resp = session.get(
            f"{LOL_ESPORTS_BASE_URL}/getEventDetails",
            params={"hl": "en-US", "id": match_id},
            headers={"x-api-key": LOL_ESPORTS_API_KEY},
            timeout=8,
        )
        if resp.status_code == 200:
            return resp.json().get("data", {}).get("event", {})
    except Exception:
        logger.exception("Failed to fetch event details for %s", match_id)
    return None


def fetch_live_events() -> list[dict]:
    """Fetch live events using getSchedule + getEventDetails for accuracy.

    The /getLive endpoint is unreliable and often returns empty.
    The /getSchedule event.state can be stale (showing 'completed' during games).
    We use /getEventDetails to check actual game states within each match.

    Optimized with concurrent HTTP requests for event details.
    """
    # First, get schedule to find recent/current events
    session = _get_http_session()
    resp = session.get(
        f"{LOL_ESPORTS_BASE_URL}/getSchedule",
        params={"hl": "en-US"},
        headers={"x-api-key": LOL_ESPORTS_API_KEY},
        timeout=8,
    )
    resp.raise_for_status()
    api_data = resp.json()

    schedule = api_data.get("data", {}).get("schedule", {})
    raw_events = schedule.get("events", [])

    now = datetime.now(timezone.utc)

    # First pass: filter candidates and identify which need detail fetches
    candidates: list[tuple[dict, bool, bool]] = []  # (event, needs_details_not_completed, needs_details_completed)

    for ev in raw_events:
        match_data = ev.get("match", {})
        if not match_data:
            continue

        # Skip events that are clearly not live (started > 12h ago or > 2h in future)
        start_time_str = ev.get("startTime", "")
        if start_time_str:
            try:
                start_time = datetime.fromisoformat(start_time_str.replace("Z", "+00:00"))
                hours_diff = (now - start_time).total_seconds() / 3600
                if hours_diff > 12 or hours_diff < -2:
                    continue
            except Exception:
                pass

        teams_raw = match_data.get("teams", [])
        has_tbd = any(
            not t.get("name", "").strip()
            or t.get("name", "").strip().upper() == "TBD"
            or not t.get("code", "").strip()
            or t.get("code", "").strip().upper() == "TBD"
            for t in teams_raw
        )
        if has_tbd:
            continue

        event_state = ev.get("state", "")
        all_games = match_data.get("games", [])

        # Check if already has inProgress game
        has_in_progress = any(g.get("state") == "inProgress" for g in all_games)

        if has_in_progress:
            candidates.append((ev, False, False))
        elif event_state != "completed":
            # Need to fetch details to check game states
            candidates.append((ev, True, False))
        elif event_state == "completed":
            # Check if recent completed event (might have inProgress games)
            try:
                start_time = datetime.fromisoformat(start_time_str.replace("Z", "+00:00"))
                hours_ago = (now - start_time).total_seconds() / 3600
                if 0 < hours_ago < 6:
                    candidates.append((ev, False, True))
            except Exception:
                pass

    # Fetch event details concurrently for events that need them
    events_needing_details = [
        (ev, ev.get("match", {}).get("id", ""))
        for ev, need_nc, need_c in candidates
        if need_nc or need_c
    ]

    details_map: dict[str, dict | None] = {}
    if events_needing_details:
        with ThreadPoolExecutor(max_workers=min(MAX_WORKERS, len(events_needing_details))) as executor:
            future_to_match = {
                executor.submit(_fetch_event_details, match_id): match_id
                for _, match_id in events_needing_details
            }
            for future in as_completed(future_to_match):
                match_id = future_to_match[future]
                try:
                    details_map[match_id] = future.result()
                except Exception:
                    details_map[match_id] = None

    # Second pass: process candidates with fetched details
    results: list[dict] = []

    for ev, need_details_nc, need_details_c in candidates:
        match_data = ev.get("match", {})
        match_id = match_data.get("id", "")
        teams_raw = match_data.get("teams", [])
        all_games = match_data.get("games", [])

        current_game_id = None

        # Check schedule's game states first
        for game in all_games:
            if game.get("state") == "inProgress":
                current_game_id = game.get("id")
                break

        # Apply fetched details if needed
        if current_game_id is None and (need_details_nc or need_details_c):
            details = details_map.get(match_id)
            if details:
                detail_match = details.get("match", {})
                detail_teams = detail_match.get("teams", [])
                if detail_teams:
                    teams_raw = detail_teams
                all_games = detail_match.get("games", []) or all_games
                for game in all_games:
                    if game.get("state") == "inProgress":
                        current_game_id = game.get("id")
                        if need_details_c:
                            logger.info(
                                "Found inProgress game %s in 'completed' event %s",
                                current_game_id, match_id
                            )
                        break

        # Skip if no live game found
        if current_game_id is None:
            continue

        league_data = ev.get("league", {})
        streams = ev.get("streams", [])
        stats_enabled = any(
            s.get("statsStatus") == "enabled" for s in streams
        )

        # Build esports team id -> team code/name map
        team_id_map: dict[str, dict] = {}
        for t in teams_raw:
            tid = t.get("id")
            if tid is not None:
                team_id_map[str(tid)] = {
                    "code": t.get("code", ""),
                    "name": t.get("name", ""),
                    "image": t.get("image", ""),
                }

        results.append({
            "match_id": match_id,
            "game_id": current_game_id,
            "start_time": ev.get("startTime", ""),
            "block_name": ev.get("blockName", ""),
            "strategy": match_data.get("strategy", {}),
            "teams_raw": teams_raw,
            "all_games": all_games,
            "team_id_map": team_id_map,
            "league": {
                "name": league_data.get("name", ""),
                "slug": league_data.get("slug", ""),
                "image": league_data.get("image", ""),
            },
            "stats_enabled": stats_enabled,
        })

    return results


# ---------------------------------------------------------------------------
# Fetch game data (window + details) from livestats
# ---------------------------------------------------------------------------


def _fetch_window_initial(game_id: str) -> dict | None:
    """Fetch livestats window WITHOUT startingTime to get the first frame.

    This is used to get the game start timestamp for accurate game time calculation.
    """
    try:
        session = _get_http_session()
        resp = session.get(
            f"{LIVESTATS_BASE_URL}/window/{game_id}",
            timeout=8,
        )
        if resp.status_code == 200 and resp.text.strip():
            return resp.json()
        return None
    except Exception:
        logger.debug("Failed to fetch initial window for game %s", game_id)
        return None


def _get_game_start_timestamp(game_id: str) -> str | None:
    """Get the game start timestamp (first frame timestamp), caching it.

    The first frame's rfc460Timestamp marks the actual game start time.
    We cache this because it never changes once the game starts.
    """
    global _game_start_cache

    # Check cache first
    cached = _game_start_cache.get(game_id)
    if cached and cached.get("first_timestamp"):
        return cached["first_timestamp"]

    # Fetch initial window to get first frame timestamp
    initial_window = _fetch_window_initial(game_id)
    if initial_window:
        frames = initial_window.get("frames", [])
        if frames:
            first_ts = frames[0].get("rfc460Timestamp")
            if first_ts:
                _game_start_cache[game_id] = {
                    "first_timestamp": first_ts,
                    "fetched_at": datetime.now(timezone.utc),
                }
                logger.debug("Cached game start timestamp for %s: %s", game_id, first_ts)
                return first_ts

    return None


def _fetch_window(game_id: str) -> dict | None:
    """Fetch livestats window with startingTime for latest data.

    Uses startingTime to get the most recent frames (last ~60s of game data).
    For game time calculation, we use _get_game_start_timestamp separately.
    """
    try:
        session = _get_http_session()
        resp = session.get(
            f"{LIVESTATS_BASE_URL}/window/{game_id}",
            params={"startingTime": _get_starting_time()},
            timeout=8,
        )
        if resp.status_code == 200 and resp.text.strip():
            data = resp.json()
            # If we got gameMetadata, return it
            if data.get("gameMetadata"):
                return data
        # Fallback: no startingTime (for very new games)
        resp = session.get(
            f"{LIVESTATS_BASE_URL}/window/{game_id}",
            timeout=8,
        )
        resp.raise_for_status()
        if resp.text.strip():
            return resp.json()
        return None
    except Exception:
        logger.exception("Failed to fetch livestats window for game %s", game_id)
        return None


def _fetch_details(game_id: str) -> dict | None:
    try:
        session = _get_http_session()
        resp = session.get(
            f"{LIVESTATS_BASE_URL}/details/{game_id}",
            params={"startingTime": _get_starting_time()},
            timeout=8,
        )
        if resp.status_code == 200 and resp.text.strip():
            data = resp.json()
            if data.get("frames"):
                return data
        resp = session.get(
            f"{LIVESTATS_BASE_URL}/details/{game_id}",
            timeout=8,
        )
        resp.raise_for_status()
        if resp.text.strip():
            return resp.json()
        return None
    except Exception:
        logger.exception("Failed to fetch livestats details for game %s", game_id)
        return None


def _has_real_data(blue_frame: dict, red_frame: dict) -> bool:
    for tf in (blue_frame, red_frame):
        if tf.get("totalKills", 0) > 0 or tf.get("totalGold", 0) > 0:
            return True
        if tf.get("towers", 0) > 0:
            return True
        for p in tf.get("participants", []):
            if p.get("level", 1) > 1 or p.get("creepScore", 0) > 0:
                return True
    return False


def _calculate_game_time(game_id: str, frames: list[dict]) -> int | None:
    """Calculate game time in seconds from frame timestamps.

    Uses the cached game start timestamp (first frame ever) and compares
    it to the latest frame timestamp for accurate game time.

    The API only returns recent frames when using startingTime parameter,
    so we need the cached first frame timestamp for accurate calculation.
    """
    if not frames:
        logger.debug("Game %s: No frames to calculate game time", game_id)
        return None

    try:
        # Get the cached game start timestamp
        first_ts = _get_game_start_timestamp(game_id)
        last_ts = frames[-1].get("rfc460Timestamp")

        if not first_ts:
            logger.debug("Game %s: Could not get game start timestamp", game_id)
            return None

        if not last_ts:
            logger.debug("Game %s: Latest frame has no timestamp", game_id)
            return None

        first_dt = datetime.fromisoformat(first_ts.replace("Z", "+00:00"))
        last_dt = datetime.fromisoformat(last_ts.replace("Z", "+00:00"))

        diff_seconds = int((last_dt - first_dt).total_seconds())
        logger.debug("Game %s: Game time = %d seconds (first=%s, last=%s)",
                     game_id, diff_seconds, first_ts, last_ts)
        return max(0, diff_seconds)
    except Exception as e:
        logger.debug("Failed to calculate game time for %s: %s", game_id, e)
        return None


def _extract_draft_from_window(window: dict) -> tuple[dict[str, str], dict[int, dict], dict[str, str | None]]:
    """Extract draft picks, participant metadata, and team IDs from a window response.

    Returns (draft_dict, participant_meta_dict, team_ids).
    draft_dict: {slot: champion_name} e.g. {"blue_top": "K'Sante", ...}
    participant_meta: {pid: {side, role, champion, championKey, summonerName}}
    team_ids: {"blue": esportsTeamId, "red": esportsTeamId}
    """
    game_meta = window.get("gameMetadata", {})
    draft: dict[str, str] = {}
    participant_meta: dict[int, dict] = {}
    team_ids: dict[str, str | None] = {"blue": None, "red": None}

    for side_key, prefix in [("blueTeamMetadata", "blue"), ("redTeamMetadata", "red")]:
        team_meta = game_meta.get(side_key, {})
        # Extract esportsTeamId for reliable team-side mapping
        esports_team_id = team_meta.get("esportsTeamId")
        if esports_team_id:
            team_ids[prefix] = str(esports_team_id)

        for p in team_meta.get("participantMetadata", []):
            pid = p.get("participantId")
            raw_champion_id = p.get("championId")
            champion_name = _resolve_champion(raw_champion_id)
            champion_key = _resolve_champion_key(raw_champion_id)
            role_raw = (p.get("role", "") or "").lower()
            role = ROLE_MAP.get(role_raw)

            if pid is not None:
                participant_meta[pid] = {
                    "side": prefix,
                    "role": role or role_raw,
                    "champion": champion_name or "?",
                    "championKey": champion_key or "",
                    "summonerName": p.get("summonerName", ""),
                }

            if champion_name and role:
                draft[f"{prefix}_{role}"] = champion_name

    return draft, participant_meta, team_ids


def _is_draft_complete(draft: dict[str, str]) -> bool:
    expected = [f"{s}_{p}" for s in ("blue", "red") for p in ("top", "jng", "mid", "bot", "sup")]
    return all(slot in draft for slot in expected)


def fetch_game_data(game_id: str) -> dict:
    """Fetch draft, live stats, and per-player data for an in-progress game.

    Uses persistent state cache to avoid losing data when API returns empty responses.
    Only updates cached state when new data is received with actual changes.
    """
    _ensure_champion_map()

    # Get cached state for this game (if any)
    cached_state = _live_game_state_cache.get(game_id, {})

    window = _fetch_window(game_id)
    if window is None:
        # No window data - return cached state if available
        if cached_state:
            logger.debug("Using cached state for game %s (no window data)", game_id)
            return {
                "draft": cached_state.get("draft"),
                "live_stats": cached_state.get("live_stats"),
                "players": cached_state.get("players"),
                "patch_version": cached_state.get("patch_version", ""),
                "ddragon_version": cached_state.get("ddragon_version", _ddragon_version),
                "team_ids": cached_state.get("team_ids", {"blue": None, "red": None}),
            }
        return {"draft": None, "live_stats": None, "players": None, "patch_version": "", "ddragon_version": _ddragon_version, "team_ids": {"blue": None, "red": None}}

    patch_version = window.get("gameMetadata", {}).get("patchVersion", "")
    draft, participant_meta, team_ids = _extract_draft_from_window(window)

    # --- Extract live stats + per-player from the latest window frame ---
    live_stats = None
    players_data: dict[str, list] | None = None
    frames = window.get("frames", [])

    if frames:
        latest = frames[-1]
        blue_frame = latest.get("blueTeam", {})
        red_frame = latest.get("redTeam", {})

        # Always populate live_stats (even with zeros) so frontend can show game state
        game_time = _calculate_game_time(game_id, frames)
        live_stats = {
            "blue_kills": blue_frame.get("totalKills", 0),
            "red_kills": red_frame.get("totalKills", 0),
            "blue_gold": blue_frame.get("totalGold", 0),
            "red_gold": red_frame.get("totalGold", 0),
            "blue_towers": blue_frame.get("towers", 0),
            "red_towers": red_frame.get("towers", 0),
            "blue_dragons": _dragons_count(blue_frame),
            "red_dragons": _dragons_count(red_frame),
            "blue_barons": blue_frame.get("barons", 0),
            "red_barons": red_frame.get("barons", 0),
            "blue_inhibitors": blue_frame.get("inhibitors", 0),
            "red_inhibitors": red_frame.get("inhibitors", 0),
            "game_time_sec": game_time,
        }

        # Always build per-player data from participant_meta + frame data
        players_by_id: dict[int, dict] = {}
        for side_key, side_prefix in [("blueTeam", "blue"), ("redTeam", "red")]:
            for p in latest.get(side_key, {}).get("participants", []):
                pid = p.get("participantId")
                meta = participant_meta.get(pid, {})
                players_by_id[pid] = {
                    "participantId": pid,
                    "side": meta.get("side", side_prefix),
                    "role": meta.get("role", ""),
                    "champion": meta.get("champion", "?"),
                    "championKey": meta.get("championKey", ""),
                    "summonerName": meta.get("summonerName", ""),
                    "level": p.get("level", 0) or 1,  # Default to level 1
                    "kills": p.get("kills", 0),
                    "deaths": p.get("deaths", 0),
                    "assists": p.get("assists", 0),
                    "creepScore": p.get("creepScore", 0),
                    "totalGold": p.get("totalGold", 0),
                    "currentHealth": p.get("currentHealth", 0),
                    "maxHealth": p.get("maxHealth", 0),
                    "items": [],
                    "wardsPlaced": 0,
                    "wardsDestroyed": 0,
                    "killParticipation": 0.0,
                    "championDamageShare": 0.0,
                }

        # Fetch additional details (items, wards, etc.)
        details = _fetch_details(game_id)
        if details:
            detail_frames = details.get("frames", [])
            if detail_frames:
                last_detail = detail_frames[-1]
                items_found = 0
                for dp in last_detail.get("participants", []):
                    pid = dp.get("participantId")
                    if pid in players_by_id:
                        items = dp.get("items", [])
                        players_by_id[pid]["items"] = items
                        players_by_id[pid]["wardsPlaced"] = dp.get("wardsPlaced", 0)
                        players_by_id[pid]["wardsDestroyed"] = dp.get("wardsDestroyed", 0)
                        players_by_id[pid]["killParticipation"] = dp.get("killParticipation", 0.0)
                        players_by_id[pid]["championDamageShare"] = dp.get("championDamageShare", 0.0)
                        if items:
                            items_found += 1
                logger.debug("Game %s: Found items for %d players", game_id, items_found)
            else:
                logger.debug("Game %s: Details response had no frames", game_id)
        else:
            logger.debug("Game %s: No details response (items will be empty)", game_id)

        role_order = {"top": 0, "jng": 1, "mid": 2, "bot": 3, "sup": 4}
        blue_players = sorted(
            [p for p in players_by_id.values() if p["side"] == "blue"],
            key=lambda x: role_order.get(x["role"], 9),
        )
        red_players = sorted(
            [p for p in players_by_id.values() if p["side"] == "red"],
            key=lambda x: role_order.get(x["role"], 9),
        )
        players_data = {"blue": blue_players, "red": red_players}

    # Prepare result
    complete_draft = draft if _is_draft_complete(draft) else None
    result = {
        "draft": complete_draft,
        "live_stats": live_stats,
        "players": players_data,
        "patch_version": patch_version,
        "ddragon_version": _ddragon_version,
        "team_ids": team_ids,
    }

    # Merge with cached state - keep cached values if new data is empty/missing
    merged_from_cache = False
    if cached_state:
        # Use cached draft if new draft is incomplete
        if result["draft"] is None and cached_state.get("draft"):
            result["draft"] = cached_state["draft"]
            merged_from_cache = True

        # Merge live_stats - keep cached non-zero values if new values are zero
        cached_stats = cached_state.get("live_stats")
        if cached_stats and result["live_stats"]:
            for key in result["live_stats"]:
                new_val = result["live_stats"].get(key)
                cached_val = cached_stats.get(key)
                # Keep cached value if new value is None or 0 but cached is non-zero
                if (new_val is None or new_val == 0) and cached_val and cached_val != 0:
                    result["live_stats"][key] = cached_val
        elif cached_stats and result["live_stats"] is None:
            result["live_stats"] = cached_stats

        # Merge players data - keep cached player data if new is empty
        cached_players = cached_state.get("players")
        if cached_players:
            if result["players"] is None:
                result["players"] = cached_players
            elif result["players"]:
                # Merge individual player stats
                for side in ("blue", "red"):
                    new_side = result["players"].get(side, [])
                    cached_side = cached_players.get(side, [])
                    for i, player in enumerate(new_side):
                        if i < len(cached_side):
                            cached_player = cached_side[i]
                            # Keep cached items if new items are empty
                            if not player.get("items") and cached_player.get("items"):
                                player["items"] = cached_player["items"]
                            # Keep cached gold/health if new values seem reset
                            if player.get("totalGold", 0) == 0 and cached_player.get("totalGold", 0) > 0:
                                player["totalGold"] = cached_player["totalGold"]
                            if player.get("currentHealth", 0) == 0 and cached_player.get("currentHealth", 0) > 0:
                                player["currentHealth"] = cached_player["currentHealth"]
                                player["maxHealth"] = cached_player.get("maxHealth", player.get("maxHealth", 0))

    if merged_from_cache:
        logger.debug("Merged cached state for game %s", game_id)

    # Update cache with merged result
    _live_game_state_cache[game_id] = {
        "draft": result["draft"],
        "live_stats": result["live_stats"],
        "players": result["players"],
        "patch_version": result["patch_version"],
        "ddragon_version": result["ddragon_version"],
        "team_ids": result["team_ids"],
        "last_updated": datetime.now(timezone.utc),
    }

    # Clean up old cache entries (games older than 2 hours)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=2)
    stale_keys = [
        k for k, v in _live_game_state_cache.items()
        if v.get("last_updated", cutoff) < cutoff
    ]
    for k in stale_keys:
        del _live_game_state_cache[k]

    # Also clean up game start timestamp cache
    stale_start_keys = [
        k for k, v in _game_start_cache.items()
        if v.get("fetched_at", cutoff) < cutoff
    ]
    for k in stale_start_keys:
        del _game_start_cache[k]

    return result


def fetch_completed_game_data(game_id: str) -> dict:
    """Fetch draft + final stats + player data for a completed game."""
    _ensure_champion_map()
    window = _fetch_window(game_id)
    if window is None:
        return {"draft": None, "final_stats": None, "players": None, "team_ids": {"blue": None, "red": None}}

    draft, participant_meta, team_ids = _extract_draft_from_window(window)
    complete_draft = draft if _is_draft_complete(draft) else None

    final_stats = None
    players_data: dict[str, list] | None = None
    frames = window.get("frames", [])

    if frames:
        latest = frames[-1]
        blue_frame = latest.get("blueTeam", {})
        red_frame = latest.get("redTeam", {})

        if _has_real_data(blue_frame, red_frame):
            final_stats = {
                "blue_kills": blue_frame.get("totalKills", 0),
                "red_kills": red_frame.get("totalKills", 0),
                "blue_gold": blue_frame.get("totalGold", 0),
                "red_gold": red_frame.get("totalGold", 0),
                "blue_towers": blue_frame.get("towers", 0),
                "red_towers": red_frame.get("towers", 0),
                "blue_inhibitors": blue_frame.get("inhibitors", 0),
                "red_inhibitors": red_frame.get("inhibitors", 0),
                "blue_dragons": _dragons_count(blue_frame),
                "red_dragons": _dragons_count(red_frame),
                "blue_barons": blue_frame.get("barons", 0),
                "red_barons": red_frame.get("barons", 0),
            }

            # Build per-player data
            players_by_id: dict[int, dict] = {}
            for side_key, side_prefix in [("blueTeam", "blue"), ("redTeam", "red")]:
                for p in latest.get(side_key, {}).get("participants", []):
                    pid = p.get("participantId")
                    meta = participant_meta.get(pid, {})
                    players_by_id[pid] = {
                        "participantId": pid,
                        "side": meta.get("side", side_prefix),
                        "role": meta.get("role", ""),
                        "champion": meta.get("champion", "?"),
                        "championKey": meta.get("championKey", ""),
                        "summonerName": meta.get("summonerName", ""),
                        "level": p.get("level", 0),
                        "kills": p.get("kills", 0),
                        "deaths": p.get("deaths", 0),
                        "assists": p.get("assists", 0),
                        "creepScore": p.get("creepScore", 0),
                        "totalGold": p.get("totalGold", 0),
                        "items": [],
                    }

            # Fetch details for items
            details = _fetch_details(game_id)
            if details:
                detail_frames = details.get("frames", [])
                if detail_frames:
                    last_detail = detail_frames[-1]
                    for dp in last_detail.get("participants", []):
                        pid = dp.get("participantId")
                        if pid in players_by_id:
                            players_by_id[pid]["items"] = dp.get("items", [])

            role_order = {"top": 0, "jng": 1, "mid": 2, "bot": 3, "sup": 4}
            blue_players = sorted(
                [p for p in players_by_id.values() if p["side"] == "blue"],
                key=lambda x: role_order.get(x["role"], 9),
            )
            red_players = sorted(
                [p for p in players_by_id.values() if p["side"] == "red"],
                key=lambda x: role_order.get(x["role"], 9),
            )
            players_data = {"blue": blue_players, "red": red_players}

    return {"draft": complete_draft, "final_stats": final_stats, "players": players_data, "team_ids": team_ids}


# ---------------------------------------------------------------------------
# Team matching
# ---------------------------------------------------------------------------


# Known aliases for teams with different names in LoL Esports API vs database
TEAM_NAME_ALIASES: dict[str, str] = {
    # API name (lowercase) -> DB name to search for
    "shanghai edward gaming hycan": "edward gaming",
    "shenzhen ninjas in pyjamas": "ninjas in pyjamas",
    "edward gaming hycan": "edward gaming",
    "nip": "ninjas in pyjamas",
    "edg": "edward gaming",
    # Add more aliases as needed
}


def match_team_to_db(team_code: str, team_name: str) -> int | None:
    """Match a team from LoL Esports API to local database.

    Tries multiple matching strategies:
    1. Check known aliases
    2. Exact short_name (code) match
    3. API name contains DB team name
    4. DB team name contains API name
    5. Common words matching (for cases like "SHANGHAI EDWARD GAMING HYCAN" → "Edward Gaming")
    """
    from .models import Team

    team_code_lower = team_code.lower().strip()
    team_name_lower = team_name.lower().strip()

    # 0. Check known aliases first
    alias_name = TEAM_NAME_ALIASES.get(team_name_lower) or TEAM_NAME_ALIASES.get(team_code_lower)
    if alias_name:
        team = Team.objects.filter(name__iexact=alias_name).first()
        if team:
            return team.id
        team = Team.objects.filter(name__icontains=alias_name).first()
        if team:
            return team.id

    # 1. Exact short_name match
    team = Team.objects.filter(short_name__iexact=team_code).first()
    if team:
        return team.id

    # 2. Check if API name contains any DB team name
    for t in Team.objects.all():
        db_name_lower = t.name.lower()
        if db_name_lower in team_name_lower:
            return t.id

    # 3. Check if any DB team name contains the API name
    team = Team.objects.filter(name__icontains=team_name).first()
    if team:
        return team.id

    # 4. Word-based matching: find teams where all significant words match
    # Remove common prefixes/suffixes and location names
    skip_words = {
        'gaming', 'esports', 'team', 'club', 'org', 'the',
        'shanghai', 'beijing', 'shenzhen', 'hangzhou', 'guangzhou',
        'seoul', 'tokyo', 'los', 'angeles', 'new', 'york',
    }

    api_words = set(team_name_lower.split()) - skip_words

    if len(api_words) >= 1:
        for t in Team.objects.all():
            db_words = set(t.name.lower().split()) - skip_words
            # If DB team words are subset of API words, it's likely a match
            if db_words and db_words.issubset(api_words):
                return t.id
            # Or if there's significant overlap (at least 2 words or 50% match)
            common = api_words & db_words
            if len(common) >= 2 or (len(common) >= 1 and len(common) / max(len(db_words), 1) >= 0.5):
                return t.id

    return None


# ---------------------------------------------------------------------------
# Build series games list
# ---------------------------------------------------------------------------


def _build_series_games(
    all_games: list[dict],
    team_id_map: dict[str, dict],
    current_game_id: str | None,
) -> list[dict]:
    """Build the series_games array with draft info for completed games.

    Optimized with concurrent fetches for completed game data.
    """
    # First, identify completed games that need data fetching
    completed_game_ids = [
        g.get("id") for g in all_games
        if g.get("state") == "completed" and g.get("id")
    ]

    # Fetch completed game data concurrently
    completed_data_map: dict[str, dict] = {}
    if completed_game_ids:
        with ThreadPoolExecutor(max_workers=min(MAX_WORKERS, len(completed_game_ids))) as executor:
            future_to_game = {
                executor.submit(fetch_completed_game_data, gid): gid
                for gid in completed_game_ids
            }
            for future in as_completed(future_to_game):
                gid = future_to_game[future]
                try:
                    completed_data_map[gid] = future.result()
                except Exception:
                    logger.exception("Failed to fetch data for completed game %s", gid)
                    completed_data_map[gid] = {"draft": None, "final_stats": None, "players": None}

    # Build series entries
    series = []
    for g in all_games:
        game_id = g.get("id")
        state = g.get("state", "unstarted")
        game_teams = g.get("teams", [])

        # Map sides
        blue_info = None
        red_info = None
        for gt in game_teams:
            tid = str(gt.get("id", ""))
            side = (gt.get("side") or "").lower()
            info = team_id_map.get(tid, {"code": "?", "name": "?", "image": ""})
            if side == "blue":
                blue_info = info
            elif side == "red":
                red_info = info

        # Fallback: if we have team data from completed game, use that for side assignment
        if (blue_info is None or red_info is None) and state == "completed" and game_id:
            data = completed_data_map.get(game_id, {})
            data_team_ids = data.get("team_ids", {})
            if data_team_ids:
                blue_id = data_team_ids.get("blue")
                red_id = data_team_ids.get("red")
                if blue_id and blue_info is None:
                    blue_info = team_id_map.get(blue_id, {"code": "?", "name": "?", "image": ""})
                if red_id and red_info is None:
                    red_info = team_id_map.get(red_id, {"code": "?", "name": "?", "image": ""})

        # Final fallback: use array order
        if blue_info is None or red_info is None:
            for i, gt in enumerate(game_teams):
                tid = str(gt.get("id", ""))
                info = team_id_map.get(tid, {"code": "?", "name": "?", "image": ""})
                if i == 0 and blue_info is None:
                    blue_info = info
                elif i == 1 and red_info is None:
                    red_info = info

        entry: dict = {
            "number": g.get("number", 0),
            "game_id": game_id,
            "state": state,
            "is_current": game_id == current_game_id,
            "blue_team": blue_info or {"code": "?", "name": "?", "image": ""},
            "red_team": red_info or {"code": "?", "name": "?", "image": ""},
            "draft": None,
            "final_stats": None,
            "players": None,
        }

        # Apply pre-fetched data for completed games
        if state == "completed" and game_id and game_id in completed_data_map:
            data = completed_data_map[game_id]
            entry["draft"] = data.get("draft")
            entry["final_stats"] = data.get("final_stats")
            entry["players"] = data.get("players")

        series.append(entry)

    return series


# ---------------------------------------------------------------------------
# Analytics enrichment
# ---------------------------------------------------------------------------

_POSITIONS = ["top", "jng", "mid", "bot", "sup"]


def compute_lane_matchups(draft: dict[str, str]) -> list[dict]:
    """Direct matchup win rate for each lane (blue champ vs red champ)."""
    from .models import Match, PlayerMatchStats

    results: list[dict] = []
    for pos in _POSITIONS:
        blue_champ = draft.get(f"blue_{pos}")
        red_champ = draft.get(f"red_{pos}")
        if not blue_champ or not red_champ:
            results.append({
                "position": pos,
                "blue_champion": blue_champ or "?",
                "red_champion": red_champ or "?",
                "blue_win_rate": None,
                "red_win_rate": None,
                "games": 0,
            })
            continue

        # Matches where blue_champ played in this position
        blue_pms = PlayerMatchStats.objects.filter(
            champion__iexact=blue_champ, position__iexact=pos,
        )
        blue_matches = {pms.match_id: pms.team_id for pms in blue_pms}
        if not blue_matches:
            results.append({
                "position": pos,
                "blue_champion": blue_champ,
                "red_champion": red_champ,
                "blue_win_rate": None,
                "red_win_rate": None,
                "games": 0,
            })
            continue

        # Matches where red_champ was on the OPPOSITE team in same position
        opp_pms = PlayerMatchStats.objects.filter(
            match_id__in=list(blue_matches.keys()),
            champion__iexact=red_champ,
            position__iexact=pos,
        )
        match_ids = []
        for opp in opp_pms:
            my_team = blue_matches.get(opp.match_id)
            if my_team is not None and opp.team_id != my_team:
                match_ids.append(opp.match_id)

        total = len(match_ids)
        if total == 0:
            results.append({
                "position": pos,
                "blue_champion": blue_champ,
                "red_champion": red_champ,
                "blue_win_rate": None,
                "red_win_rate": None,
                "games": 0,
            })
            continue

        winner_map = dict(
            Match.objects.filter(id__in=match_ids).values_list("id", "winner_id")
        )
        blue_wins = sum(
            1 for mid in match_ids if winner_map.get(mid) == blue_matches[mid]
        )
        red_wins = total - blue_wins
        blue_wr = round((blue_wins / total) * 100, 1)
        results.append({
            "position": pos,
            "blue_champion": blue_champ,
            "red_champion": red_champ,
            "blue_win_rate": blue_wr,
            "red_win_rate": round(100.0 - blue_wr, 1),
            "blue_wins": blue_wins,
            "red_wins": red_wins,
            "games": total,
        })

    return results


def compute_team_synergies(draft: dict[str, str], side: str) -> list[dict]:
    """Top synergy pairs (same-team champion combos) for the given side's draft."""
    from itertools import combinations

    from .models import Match, PlayerMatchStats

    team_picks = []
    for pos in _POSITIONS:
        champ = draft.get(f"{side}_{pos}")
        if champ:
            team_picks.append((champ, pos))

    if len(team_picks) < 2:
        return []

    min_games = 3
    pair_results: list[dict] = []

    for (c1, p1), (c2, p2) in combinations(team_picks, 2):
        c1_pms = PlayerMatchStats.objects.filter(
            champion__iexact=c1, position__iexact=p1,
        )
        c1_matches = {pms.match_id: pms.team_id for pms in c1_pms}
        if not c1_matches:
            continue

        c2_pms = PlayerMatchStats.objects.filter(
            match_id__in=list(c1_matches.keys()),
            champion__iexact=c2,
            position__iexact=p2,
        )
        match_ids = []
        for pms in c2_pms:
            c1_team = c1_matches.get(pms.match_id)
            if c1_team is not None and pms.team_id == c1_team:
                match_ids.append(pms.match_id)

        total = len(match_ids)
        if total < min_games:
            continue

        winner_map = dict(
            Match.objects.filter(id__in=match_ids).values_list("id", "winner_id")
        )
        wins = sum(
            1 for mid in match_ids if winner_map.get(mid) == c1_matches[mid]
        )
        pair_results.append({
            "champion1": c1,
            "position1": p1,
            "champion2": c2,
            "position2": p2,
            "games": total,
            "wins": wins,
            "win_rate": round((wins / total) * 100, 1),
        })

    pair_results.sort(key=lambda x: (-x["win_rate"], -x["games"]))
    return pair_results[:5]


def compute_champion_stats_for_draft(draft: dict[str, str]) -> dict[str, dict | None]:
    """Aggregate historical stats for each of the 10 drafted champions."""
    from .prediction import compute_champion_aggregate_stats

    result: dict[str, dict | None] = {}
    for side in ("blue", "red"):
        for pos in _POSITIONS:
            slot = f"{side}_{pos}"
            champion = draft.get(slot)
            if not champion:
                result[slot] = None
                continue
            stats = compute_champion_aggregate_stats(champion, pos)
            if stats:
                result[slot] = {
                    "win_rate": round(stats["win_rate"] * 100, 1),
                    "avg_kda": round(stats["avg_kda"], 2),
                    "avg_kills": round(stats["avg_kills"], 1),
                    "avg_deaths": round(stats["avg_deaths"], 1),
                    "avg_gold_per_min": round(stats["avg_gold_per_min"], 1),
                    "avg_damage_per_min": round(stats["avg_damage_per_min"], 1),
                    "avg_cs_per_min": round(stats["avg_cs_per_min"], 1),
                    "games_played": int(stats["games_played"]),
                }
            else:
                result[slot] = None

    return result


def _find_player_by_name(summoner_name: str):
    """Find player in database, handling team prefix changes.

    Players often have team prefixes in their names that change when they
    switch teams (e.g., "Loud Tinowns" -> "Pain Tinowns").
    This function tries multiple strategies to find the player.
    """
    from .models import Player

    if not summoner_name:
        return None

    # 1. Try exact match first (case-insensitive)
    player = Player.objects.filter(name__iexact=summoner_name).first()
    if player:
        return player

    # 2. Extract core name (last part after space) and search
    # e.g., "Loud Tinowns" -> "Tinowns"
    parts = summoner_name.strip().split()
    if len(parts) > 1:
        core_name = parts[-1]  # Last part is usually the player name

        # Try exact match on core name
        player = Player.objects.filter(name__iexact=core_name).first()
        if player:
            return player

        # Try finding player whose name ends with the core name
        # This handles "Loud Tinowns" matching "Pain Tinowns" or just "Tinowns"
        player = Player.objects.filter(name__iendswith=core_name).first()
        if player:
            return player

        # Try finding player whose name contains the core name
        # More lenient search as last resort
        player = Player.objects.filter(name__icontains=core_name).first()
        if player:
            return player

    return None


def compute_player_champion_stats(
    players: dict[str, list] | None,
    draft: dict[str, str],
) -> dict[str, dict | None]:
    """Compute player's historical stats with their drafted champion.

    Returns dict keyed by slot (e.g. "blue_top") with player champion history.
    Aggregates stats across all teams the player has played for.
    """
    from .models import PlayerMatchStats, TeamMatchStats

    if not players:
        return {}

    result: dict[str, dict | None] = {}

    for side in ("blue", "red"):
        side_players = players.get(side, [])
        for player_data in side_players:
            role = player_data.get("role", "").lower()
            if role not in _POSITIONS:
                continue

            slot = f"{side}_{role}"
            summoner_name = player_data.get("summonerName", "")
            champion = draft.get(slot)

            if not summoner_name or not champion:
                result[slot] = None
                continue

            try:
                # Find player using flexible name matching
                player = _find_player_by_name(summoner_name)
                if not player:
                    result[slot] = None
                    continue

                # Get player's history with this champion (across ALL teams)
                pc_stats = PlayerMatchStats.objects.filter(
                    player=player, champion__iexact=champion
                )
                pc_count = pc_stats.count()

                if pc_count > 0:
                    # Get wins for this player on this champion
                    # We need to check each match individually since player may have
                    # played for different teams
                    wins = 0
                    for ps in pc_stats.select_related("match"):
                        team_won = TeamMatchStats.objects.filter(
                            match_id=ps.match_id,
                            team_id=ps.team_id,
                            is_winner=True
                        ).exists()
                        if team_won:
                            wins += 1

                    win_rate = round((wins / pc_count) * 100, 1) if pc_count > 0 else 0

                    result[slot] = {
                        "player_name": player.name,
                        "games": pc_count,
                        "wins": wins,
                        "win_rate": win_rate,
                    }
                else:
                    result[slot] = None
            except Exception:
                result[slot] = None

    return result


def get_recent_matches(team_id: int, limit: int = 5) -> list[dict]:
    """Get the last N matches for a team with side and result."""
    from .models import TeamMatchStats

    recent = (
        TeamMatchStats.objects
        .filter(team_id=team_id)
        .select_related("match", "match__blue_team", "match__red_team")
        .order_by("-match__date")[:limit]
    )

    matches = []
    for tms in recent:
        match = tms.match
        opponent = match.red_team if match.blue_team_id == team_id else match.blue_team
        matches.append({
            "date": match.date.isoformat() if match.date else None,
            "opponent_code": opponent.short_name or opponent.name[:3].upper() if opponent else "???",
            "opponent_image": None,  # Could add team images later
            "side": tms.side,  # "Blue" or "Red"
            "won": tms.is_winner,
        })
    return matches


def compute_team_context(
    blue_db_id: int, red_db_id: int,
) -> dict:
    """ELO ratings, H2H record, and recent form for both teams."""
    from .prediction import compute_h2h_features, compute_team_features, get_team_elo

    blue_elo = get_team_elo(blue_db_id)
    red_elo = get_team_elo(red_db_id)
    blue_features = compute_team_features(blue_db_id)
    red_features = compute_team_features(red_db_id)
    h2h = compute_h2h_features(blue_db_id, red_db_id)
    blue_recent = get_recent_matches(blue_db_id)
    red_recent = get_recent_matches(red_db_id)

    def _team_summary(features: dict | None, elo: dict, recent: list[dict]) -> dict:
        summary: dict = {
            "elo": {
                "global": round(elo["global"], 1),
                "blue": round(elo["blue"], 1),
                "red": round(elo["red"], 1),
            },
            "stats": None,
            "recent_matches": recent,
        }
        if features:
            summary["stats"] = {
                "win_rate": round(features["win_rate"] * 100, 1),
                "avg_kills": round(features["avg_kills"], 1),
                "avg_deaths": round(features["avg_deaths"], 1),
                "avg_towers": round(features["avg_towers"], 1),
                "avg_dragons": round(features["avg_dragons"], 1),
                "avg_barons": round(features["avg_barons"], 1),
                "first_blood_rate": round(features["first_blood_rate"] * 100, 1),
                "first_tower_rate": round(features["first_tower_rate"] * 100, 1),
                "avg_golddiffat15": round(features["avg_golddiffat15"], 1),
                "avg_game_length": round(features["avg_game_length"], 1),
                "win_rate_last3": round(features["win_rate_last3"] * 100, 1),
                "win_rate_last5": round(features["win_rate_last5"] * 100, 1),
                "streak": features["streak"],
                "blue_win_rate": round(features["blue_win_rate"] * 100, 1),
                "red_win_rate": round(features["red_win_rate"] * 100, 1),
            }
        return summary

    return {
        "blue_team": _team_summary(blue_features, blue_elo, blue_recent),
        "red_team": _team_summary(red_features, red_elo, red_recent),
        "h2h": {
            "total_games": h2h["total_games_vs"],
            "blue_win_rate": round(h2h["win_rate_vs"] * 100, 1),
            "red_win_rate": round((1 - h2h["win_rate_vs"]) * 100, 1),
            "recent_form_blue": round(h2h["recent_form_vs"] * 100, 1),
        },
    }


def compute_match_prediction(blue_db_id: int, red_db_id: int) -> dict | None:
    """Team-history-based match prediction (separate model from draft prediction)."""
    from .prediction import predict_match

    try:
        result = predict_match(blue_db_id, red_db_id)
        preds = result.get("predictions")
        if preds:
            return {
                "blue_win_prob": preds["team1_win_prob"],
                "red_win_prob": preds["team2_win_prob"],
                "total_kills": preds["total_kills"],
                "total_towers": preds["total_towers"],
                "total_dragons": preds["total_dragons"],
                "total_barons": preds["total_barons"],
                "game_time": preds["game_time"],
            }
        return {
            "error": result.get("message", "Prediction unavailable"),
            "features_available": result.get("features_available", False),
            "models_loaded": result.get("models_loaded", False),
        }
    except Exception:
        logger.exception("predict_match failed for %s vs %s", blue_db_id, red_db_id)
        return None


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------


def get_live_games_data(minimal: bool = False) -> list[dict]:
    """Fetch and process live games data with caching to reduce API load.

    Uses a short-lived cache (3s) to reduce redundant API calls when
    the frontend polls frequently (every 5s).

    Args:
        minimal: If True, skip expensive computations (predictions, enrichment, players)
                 for faster response in list views.
    """
    from .prediction import predict_draft

    # Check cache first (only for full data, minimal always fetches fresh)
    now = datetime.now(timezone.utc)
    if not minimal and _live_events_cache["data"] is not None and _live_events_cache["timestamp"]:
        age = (now - _live_events_cache["timestamp"]).total_seconds()
        if age < _CACHE_TTL_SECONDS:
            return _live_events_cache["data"]

    events = fetch_live_events()
    if not events:
        # Cache empty result too
        if not minimal:
            _live_events_cache["data"] = []
            _live_events_cache["timestamp"] = now
        return []

    # In minimal mode, skip fetching game data entirely (much faster)
    game_data_map: dict[str, dict] = {}
    if not minimal:
        # Fetch game data concurrently for all live events
        game_ids = [ev.get("game_id") for ev in events if ev.get("game_id")]
        if game_ids:
            with ThreadPoolExecutor(max_workers=min(MAX_WORKERS, len(game_ids))) as executor:
                future_to_game = {
                    executor.submit(fetch_game_data, gid): gid
                    for gid in game_ids
                }
                for future in as_completed(future_to_game):
                    gid = future_to_game[future]
                    try:
                        game_data_map[gid] = future.result()
                    except Exception:
                        logger.exception("Failed to fetch game data for %s", gid)
                        game_data_map[gid] = {
                            "draft": None, "live_stats": None, "players": None,
                            "patch_version": "", "ddragon_version": _ddragon_version,
                            "team_ids": {"blue": None, "red": None}
                        }

    games: list[dict] = []

    for ev in events:
        teams_raw = ev["teams_raw"]
        game_id = ev.get("game_id")

        # Get pre-fetched game data
        draft = None
        live_stats = None
        players = None
        patch_version = ""
        ddragon_version = _ddragon_version
        team_ids: dict[str, str | None] = {"blue": None, "red": None}
        if game_id and game_id in game_data_map:
            gd = game_data_map[game_id]
            draft = gd["draft"]
            live_stats = gd["live_stats"]
            players = gd["players"]
            patch_version = gd["patch_version"]
            ddragon_version = gd.get("ddragon_version", _ddragon_version)
            team_ids = gd.get("team_ids", {"blue": None, "red": None})

        # Use team_ids from livestats (most reliable source) to map teams_raw to blue/red
        blue_raw = None
        red_raw = None
        blue_esports_id = team_ids.get("blue")
        red_esports_id = team_ids.get("red")

        # Log details for debugging team matching
        teams_raw_info = [(str(t.get("id", "")), t.get("code", "")) for t in teams_raw]
        logger.info(
            "Team mapping for game %s: livestats blue_id=%r, red_id=%r, teams_raw=%s",
            game_id, blue_esports_id, red_esports_id, teams_raw_info,
        )

        # Step 1: Try matching by esportsTeamId from livestats
        if blue_esports_id or red_esports_id:
            for t in teams_raw:
                tid = str(t.get("id", ""))
                if blue_esports_id and tid == blue_esports_id:
                    blue_raw = t
                    logger.debug("Matched blue team by ID: %s -> %s", blue_esports_id, t.get("code"))
                if red_esports_id and tid == red_esports_id:
                    red_raw = t
                    logger.debug("Matched red team by ID: %s -> %s", red_esports_id, t.get("code"))

        # Step 2: Fallback - use game's teams[].side from all_games (most reliable for current game)
        if (blue_raw is None or red_raw is None) and game_id:
            for g in ev.get("all_games", []):
                # Match by game ID (handle both string and int comparison)
                gid = g.get("id")
                if str(gid) == str(game_id):
                    game_teams = g.get("teams", [])
                    logger.debug(
                        "Found game %s in all_games with teams: %s",
                        game_id,
                        [(gt.get("id"), gt.get("side")) for gt in game_teams],
                    )
                    for gt in game_teams:
                        tid = str(gt.get("id", ""))
                        side = (gt.get("side") or "").lower()
                        for t in teams_raw:
                            if str(t.get("id", "")) == tid:
                                if side == "blue" and blue_raw is None:
                                    blue_raw = t
                                elif side == "red" and red_raw is None:
                                    red_raw = t
                                break
                    break

        # Step 2.5: Fallback - if we have partial match but using all_games didn't complete it,
        # try to find the other team by exclusion
        if blue_raw and not red_raw and len(teams_raw) == 2:
            red_raw = teams_raw[1] if teams_raw[0].get("id") == blue_raw.get("id") else teams_raw[0]
            logger.debug("Assigned red_raw by exclusion: %s", red_raw.get("code"))
        elif red_raw and not blue_raw and len(teams_raw) == 2:
            blue_raw = teams_raw[1] if teams_raw[0].get("id") == red_raw.get("id") else teams_raw[0]
            logger.debug("Assigned blue_raw by exclusion: %s", blue_raw.get("code"))

        # Step 3: Verify we have two different teams assigned
        if blue_raw and red_raw and blue_raw.get("id") == red_raw.get("id"):
            logger.warning(
                "Same team assigned to both sides for game %s, resetting",
                game_id,
            )
            blue_raw = None
            red_raw = None

        # Step 4: If we still couldn't determine sides, use fallback
        if blue_raw is None or red_raw is None:
            logger.warning(
                "Could not determine team sides for game %s. blue_raw=%s, red_raw=%s, teams_raw=%s",
                game_id,
                blue_raw.get("code") if blue_raw else None,
                red_raw.get("code") if red_raw else None,
                [t.get("code") for t in teams_raw],
            )
            # Final fallback to array order
            if blue_raw is None:
                blue_raw = teams_raw[0] if len(teams_raw) > 0 else {}
            if red_raw is None:
                # Make sure we don't assign the same team to both sides
                if len(teams_raw) > 1 and teams_raw[1].get("id") != blue_raw.get("id"):
                    red_raw = teams_raw[1]
                elif len(teams_raw) > 0 and teams_raw[0].get("id") != blue_raw.get("id"):
                    red_raw = teams_raw[0]
                else:
                    red_raw = {}
        else:
            logger.debug(
                "Team sides determined for game %s: blue=%s, red=%s",
                game_id,
                blue_raw.get("code"),
                red_raw.get("code"),
            )

        # In minimal mode, skip DB lookups and expensive computations
        blue_db_id = None
        red_db_id = None
        prediction = None
        enrichment = None
        series_games = None

        if not minimal:
            blue_db_id = match_team_to_db(
                blue_raw.get("code", ""),
                blue_raw.get("name", ""),
            )
            red_db_id = match_team_to_db(
                red_raw.get("code", ""),
                red_raw.get("name", ""),
            )

            if draft:
                try:
                    prediction = predict_draft(
                        draft,
                        blue_team_id=blue_db_id,
                        red_team_id=red_db_id,
                    )
                except Exception:
                    logger.exception("predict_draft failed for game %s", game_id)

            # Analytics enrichment (only for current in-progress game)
            if draft:
                try:
                    lane_matchups = compute_lane_matchups(draft)
                    blue_synergies = compute_team_synergies(draft, "blue")
                    red_synergies = compute_team_synergies(draft, "red")
                    champion_stats = compute_champion_stats_for_draft(draft)
                    player_champion_stats = compute_player_champion_stats(players, draft)

                    # Enrich lane matchups with player champion stats
                    if lane_matchups and player_champion_stats:
                        for mu in lane_matchups:
                            pos = mu["position"]
                            blue_slot = f"blue_{pos}"
                            red_slot = f"red_{pos}"
                            mu["blue_player_stats"] = player_champion_stats.get(blue_slot)
                            mu["red_player_stats"] = player_champion_stats.get(red_slot)

                    enrichment = {
                        "lane_matchups": lane_matchups,
                        "synergies": {
                            "blue": blue_synergies,
                            "red": red_synergies,
                        },
                        "champion_stats": champion_stats,
                        "team_context": None,
                        "match_prediction": None,
                    }

                    if blue_db_id is not None and red_db_id is not None:
                        try:
                            enrichment["team_context"] = compute_team_context(
                                blue_db_id, red_db_id,
                            )
                        except Exception:
                            logger.exception("compute_team_context failed")

                        try:
                            enrichment["match_prediction"] = compute_match_prediction(
                                blue_db_id, red_db_id,
                            )
                        except Exception:
                            logger.exception("compute_match_prediction failed")
                except Exception:
                    logger.exception("enrichment failed for game %s", game_id)

            # Build series games for Bo3/Bo5
            strategy = ev.get("strategy", {})
            series_count = strategy.get("count", 1)
            if series_count > 1:
                series_games = _build_series_games(
                    ev.get("all_games", []),
                    ev.get("team_id_map", {}),
                    game_id,
                )
                # Inject current game draft into its series entry
                if series_games and draft:
                    for sg in series_games:
                        if sg.get("is_current"):
                            sg["draft"] = draft
                            break

        strategy = ev.get("strategy", {})

        def _build_team(raw: dict, db_id: int | None) -> dict:
            return {
                "name": raw.get("name", ""),
                "code": raw.get("code", ""),
                "image": raw.get("image", ""),
                "result": raw.get("result"),
                "db_team_id": db_id,
            }

        games.append({
            "match_id": ev["match_id"],
            "game_id": game_id,
            "start_time": ev.get("start_time", ""),
            "league": ev["league"],
            "block_name": ev["block_name"],
            "strategy": strategy,
            "stats_enabled": ev.get("stats_enabled", False),
            "patch_version": patch_version,
            "ddragon_version": ddragon_version,
            "blue_team": _build_team(blue_raw, blue_db_id),
            "red_team": _build_team(red_raw, red_db_id),
            "draft": draft,
            "live_stats": live_stats,
            "players": players,
            "prediction": prediction,
            "enrichment": enrichment,
            "series_games": series_games,
        })

    # Update cache only for full requests
    if not minimal:
        _live_events_cache["data"] = games
        _live_events_cache["timestamp"] = datetime.now(timezone.utc)

    return games
