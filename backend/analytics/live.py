"""Live games module: fetches in-progress LoL Esports matches, retrieves
champion picks and live stats via livestats, maps champion IDs to names via
Data Dragon, matches teams to the local DB, and runs draft predictions."""

import logging
from datetime import datetime, timedelta, timezone

import requests as http_requests

logger = logging.getLogger(__name__)

LOL_ESPORTS_API_KEY = "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z"
LOL_ESPORTS_BASE_URL = "https://esports-api.lolesports.com/persisted/gw"
LIVESTATS_BASE_URL = "https://feed.lolesports.com/livestats/v1"

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
        versions_resp = http_requests.get(
            "https://ddragon.leagueoflegends.com/api/versions.json",
            timeout=10,
        )
        versions_resp.raise_for_status()
        _ddragon_version = versions_resp.json()[0]

        champ_resp = http_requests.get(
            f"https://ddragon.leagueoflegends.com/cdn/{_ddragon_version}/data/en_US/champion.json",
            timeout=10,
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


def fetch_live_events() -> list[dict]:
    resp = http_requests.get(
        f"{LOL_ESPORTS_BASE_URL}/getLive",
        params={"hl": "pt-BR"},
        headers={"x-api-key": LOL_ESPORTS_API_KEY},
        timeout=10,
    )
    resp.raise_for_status()
    api_data = resp.json()

    schedule = api_data.get("data", {}).get("schedule", {})
    raw_events = schedule.get("events", [])

    results: list[dict] = []

    for ev in raw_events:
        if ev.get("state") != "inProgress":
            continue

        match_data = ev.get("match", {})
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

        current_game_id = None
        all_games = match_data.get("games", [])
        for game in all_games:
            if game.get("state") == "inProgress":
                current_game_id = game.get("id")
                break

        league_data = ev.get("league", {})
        streams = ev.get("streams", [])
        stats_enabled = any(
            s.get("statsStatus") == "enabled" for s in streams
        )

        # Build esports team id -> team code/name map
        team_id_map: dict[str, dict] = {}
        for t in teams_raw:
            team_id_map[str(t.get("id", ""))] = {
                "code": t.get("code", ""),
                "name": t.get("name", ""),
                "image": t.get("image", ""),
            }

        results.append({
            "match_id": match_data.get("id", ""),
            "game_id": current_game_id,
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


def _fetch_window(game_id: str) -> dict | None:
    """Fetch livestats window.  Tries with startingTime first, falls back
    to bare request so we always get gameMetadata even for very new games."""
    try:
        resp = http_requests.get(
            f"{LIVESTATS_BASE_URL}/window/{game_id}",
            params={"startingTime": _get_starting_time()},
            timeout=10,
        )
        if resp.status_code == 200 and resp.text.strip():
            data = resp.json()
            # If we got gameMetadata, return it
            if data.get("gameMetadata"):
                return data
        # Fallback: no startingTime
        resp = http_requests.get(
            f"{LIVESTATS_BASE_URL}/window/{game_id}",
            timeout=10,
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
        resp = http_requests.get(
            f"{LIVESTATS_BASE_URL}/details/{game_id}",
            params={"startingTime": _get_starting_time()},
            timeout=10,
        )
        if resp.status_code == 200 and resp.text.strip():
            data = resp.json()
            if data.get("frames"):
                return data
        resp = http_requests.get(
            f"{LIVESTATS_BASE_URL}/details/{game_id}",
            timeout=10,
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


def _extract_draft_from_window(window: dict) -> tuple[dict[str, str], dict[int, dict]]:
    """Extract draft picks and participant metadata from a window response.

    Returns (draft_dict, participant_meta_dict).
    draft_dict: {slot: champion_name} e.g. {"blue_top": "K'Sante", ...}
    participant_meta: {pid: {side, role, champion, championKey, summonerName}}
    """
    game_meta = window.get("gameMetadata", {})
    draft: dict[str, str] = {}
    participant_meta: dict[int, dict] = {}

    for side_key, prefix in [("blueTeamMetadata", "blue"), ("redTeamMetadata", "red")]:
        team_meta = game_meta.get(side_key, {})
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

    return draft, participant_meta


def _is_draft_complete(draft: dict[str, str]) -> bool:
    expected = [f"{s}_{p}" for s in ("blue", "red") for p in ("top", "jng", "mid", "bot", "sup")]
    return all(slot in draft for slot in expected)


def fetch_game_data(game_id: str) -> dict:
    """Fetch draft, live stats, and per-player data for an in-progress game."""
    _ensure_champion_map()

    window = _fetch_window(game_id)
    if window is None:
        return {"draft": None, "live_stats": None, "players": None, "patch_version": "", "ddragon_version": _ddragon_version}

    patch_version = window.get("gameMetadata", {}).get("patchVersion", "")
    draft, participant_meta = _extract_draft_from_window(window)

    # --- Extract live stats + per-player from the latest window frame ---
    live_stats = None
    players_data: dict[str, list] | None = None
    frames = window.get("frames", [])

    if frames:
        latest = frames[-1]
        blue_frame = latest.get("blueTeam", {})
        red_frame = latest.get("redTeam", {})

        if _has_real_data(blue_frame, red_frame):
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
                "game_time_sec": None,
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
                        "currentHealth": p.get("currentHealth", 0),
                        "maxHealth": p.get("maxHealth", 0),
                        "items": [],
                        "wardsPlaced": 0,
                        "wardsDestroyed": 0,
                        "killParticipation": 0.0,
                        "championDamageShare": 0.0,
                    }

            details = _fetch_details(game_id)
            if details:
                detail_frames = details.get("frames", [])
                if detail_frames:
                    last_detail = detail_frames[-1]
                    for dp in last_detail.get("participants", []):
                        pid = dp.get("participantId")
                        if pid in players_by_id:
                            players_by_id[pid]["items"] = dp.get("items", [])
                            players_by_id[pid]["wardsPlaced"] = dp.get("wardsPlaced", 0)
                            players_by_id[pid]["wardsDestroyed"] = dp.get("wardsDestroyed", 0)
                            players_by_id[pid]["killParticipation"] = dp.get("killParticipation", 0.0)
                            players_by_id[pid]["championDamageShare"] = dp.get("championDamageShare", 0.0)

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

    return {
        "draft": draft if _is_draft_complete(draft) else None,
        "live_stats": live_stats,
        "players": players_data,
        "patch_version": patch_version,
        "ddragon_version": _ddragon_version,
    }


def fetch_completed_game_draft(game_id: str) -> dict[str, str] | None:
    """Fetch only the draft for a completed game (lightweight)."""
    _ensure_champion_map()
    window = _fetch_window(game_id)
    if window is None:
        return None
    draft, _ = _extract_draft_from_window(window)
    return draft if _is_draft_complete(draft) else None


# ---------------------------------------------------------------------------
# Team matching
# ---------------------------------------------------------------------------


def match_team_to_db(team_code: str, team_name: str) -> int | None:
    from .models import Team

    team = Team.objects.filter(short_name__iexact=team_code).first()
    if team:
        return team.id
    team = Team.objects.filter(name__icontains=team_name).first()
    if team:
        return team.id
    return None


# ---------------------------------------------------------------------------
# Build series games list
# ---------------------------------------------------------------------------


def _build_series_games(
    all_games: list[dict],
    team_id_map: dict[str, dict],
    current_game_id: str | None,
) -> list[dict]:
    """Build the series_games array with draft info for completed games."""
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
            side = gt.get("side", "")
            info = team_id_map.get(tid, {"code": "?", "name": "?", "image": ""})
            if side == "blue":
                blue_info = info
            elif side == "red":
                red_info = info

        entry: dict = {
            "number": g.get("number", 0),
            "game_id": game_id,
            "state": state,
            "is_current": game_id == current_game_id,
            "blue_team": blue_info or {"code": "?", "name": "?", "image": ""},
            "red_team": red_info or {"code": "?", "name": "?", "image": ""},
            "draft": None,
        }

        # Fetch draft for completed games
        if state == "completed" and game_id:
            try:
                entry["draft"] = fetch_completed_game_draft(game_id)
            except Exception:
                logger.exception("Failed to fetch draft for completed game %s", game_id)

        series.append(entry)

    return series


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------


def get_live_games_data() -> list[dict]:
    from .prediction import predict_draft

    events = fetch_live_events()
    games: list[dict] = []

    for ev in events:
        teams_raw = ev["teams_raw"]
        blue_raw = teams_raw[0] if len(teams_raw) > 0 else {}
        red_raw = teams_raw[1] if len(teams_raw) > 1 else {}

        blue_db_id = match_team_to_db(
            blue_raw.get("code", ""),
            blue_raw.get("name", ""),
        )
        red_db_id = match_team_to_db(
            red_raw.get("code", ""),
            red_raw.get("name", ""),
        )

        draft = None
        live_stats = None
        players = None
        patch_version = ""
        ddragon_version = _ddragon_version
        game_id = ev.get("game_id")
        if game_id:
            gd = fetch_game_data(game_id)
            draft = gd["draft"]
            live_stats = gd["live_stats"]
            players = gd["players"]
            patch_version = gd["patch_version"]
            ddragon_version = gd.get("ddragon_version", _ddragon_version)

        prediction = None
        if draft:
            try:
                prediction = predict_draft(
                    draft,
                    blue_team_id=blue_db_id,
                    red_team_id=red_db_id,
                )
            except Exception:
                logger.exception("predict_draft failed for game %s", game_id)

        # Build series games for Bo3/Bo5
        strategy = ev.get("strategy", {})
        series_count = strategy.get("count", 1)
        series_games = None
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
            "series_games": series_games,
        })

    return games
