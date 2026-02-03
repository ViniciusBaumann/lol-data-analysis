"""Advanced feature engineering for ML predictions.

This module provides additional features for improving prediction accuracy:
1. Patch-specific champion win rates
3. Tournament stage/pressure indicators
4. Team composition analysis (early/late game, damage types, synergy)
5. Lane matchup advantages
6. Player individual form (recent performance)
"""

from collections import defaultdict
from typing import Optional

# Champion classifications for team comp analysis
# Categories: early_game, scaling, teamfight, splitpush, poke, engage, tank, assassin
CHAMPION_TAGS = {
    # Top laners
    "Aatrox": ["teamfight", "sustain", "bruiser"],
    "Camille": ["splitpush", "scaling", "diver"],
    "Chogath": ["tank", "scaling", "teamfight"],
    "Darius": ["early_game", "bruiser", "teamfight"],
    "DrMundo": ["tank", "scaling", "sustain"],
    "Fiora": ["splitpush", "scaling", "duelist"],
    "Gangplank": ["scaling", "poke", "teamfight"],
    "Garen": ["early_game", "bruiser", "simple"],
    "Gnar": ["teamfight", "tank", "poke"],
    "Gragas": ["teamfight", "engage", "tank"],
    "Gwen": ["scaling", "teamfight", "ap"],
    "Illaoi": ["splitpush", "sustain", "bruiser"],
    "Irelia": ["early_game", "teamfight", "diver"],
    "Jax": ["scaling", "splitpush", "duelist"],
    "Jayce": ["early_game", "poke", "lane_bully"],
    "Kayle": ["scaling", "hypercarry", "ap"],
    "Kennen": ["teamfight", "engage", "ap"],
    "Kled": ["early_game", "engage", "bruiser"],
    "KSante": ["tank", "teamfight", "outplay"],
    "Malphite": ["teamfight", "engage", "tank"],
    "Mordekaiser": ["teamfight", "ap", "bruiser"],
    "Nasus": ["scaling", "splitpush", "tank"],
    "Olaf": ["early_game", "bruiser", "dive"],
    "Ornn": ["tank", "teamfight", "scaling"],
    "Poppy": ["tank", "counter_engage", "peel"],
    "Quinn": ["early_game", "roam", "lane_bully"],
    "Renekton": ["early_game", "bruiser", "lane_bully"],
    "Rengar": ["assassin", "early_game", "burst"],
    "Riven": ["early_game", "outplay", "bruiser"],
    "Rumble": ["teamfight", "ap", "early_game"],
    "Sett": ["early_game", "teamfight", "bruiser"],
    "Shen": ["tank", "global", "teamfight"],
    "Singed": ["splitpush", "proxy", "tank"],
    "Sion": ["tank", "scaling", "teamfight"],
    "Teemo": ["poke", "lane_bully", "ap"],
    "Trundle": ["tank_buster", "splitpush", "early_game"],
    "Tryndamere": ["splitpush", "scaling", "hypercarry"],
    "Urgot": ["bruiser", "teamfight", "scaling"],
    "Vladimir": ["scaling", "teamfight", "ap"],
    "Volibear": ["early_game", "dive", "bruiser"],
    "Warwick": ["early_game", "sustain", "bruiser"],
    "Wukong": ["teamfight", "engage", "bruiser"],
    "Yasuo": ["scaling", "teamfight", "hypercarry"],
    "Yone": ["scaling", "teamfight", "hypercarry"],
    "Yorick": ["splitpush", "scaling", "bruiser"],
    "Zac": ["tank", "engage", "teamfight"],

    # Junglers
    "Amumu": ["teamfight", "engage", "tank"],
    "BelVeth": ["scaling", "hypercarry", "objective"],
    "Briar": ["early_game", "assassin", "dive"],
    "Diana": ["teamfight", "ap", "dive"],
    "Ekko": ["scaling", "ap", "assassin"],
    "Elise": ["early_game", "dive", "ap"],
    "Evelynn": ["scaling", "assassin", "ap"],
    "Fiddlesticks": ["teamfight", "ap", "ambush"],
    "Graves": ["early_game", "bruiser", "farm"],
    "Hecarim": ["teamfight", "engage", "scaling"],
    "Ivern": ["support", "utility", "scaling"],
    "JarvanIV": ["early_game", "engage", "teamfight"],
    "Karthus": ["scaling", "farm", "ap"],
    "Kayn": ["scaling", "assassin", "bruiser"],
    "Khazix": ["assassin", "early_game", "pick"],
    "Kindred": ["scaling", "marksman", "objective"],
    "LeeSin": ["early_game", "outplay", "playmaker"],
    "Lillia": ["scaling", "ap", "teamfight"],
    "Maokai": ["tank", "engage", "teamfight"],
    "MasterYi": ["scaling", "hypercarry", "farm"],
    "Naafiri": ["early_game", "assassin", "roam"],
    "Nidalee": ["early_game", "poke", "ap"],
    "Nocturne": ["scaling", "assassin", "global"],
    "Nunu": ["objective", "engage", "tank"],
    "Pantheon": ["early_game", "global", "bruiser"],
    "RekSai": ["early_game", "bruiser", "map_control"],
    "Sejuani": ["tank", "engage", "teamfight"],
    "Shaco": ["early_game", "assassin", "trick"],
    "Shyvana": ["scaling", "farm", "objective"],
    "Skarner": ["engage", "pick", "tank"],
    "Taliyah": ["early_game", "roam", "ap"],
    "Talon": ["early_game", "assassin", "roam"],
    "Udyr": ["early_game", "bruiser", "objective"],
    "Viego": ["scaling", "assassin", "reset"],
    "Vi": ["early_game", "engage", "bruiser"],
    "XinZhao": ["early_game", "bruiser", "dive"],
    "Zed": ["assassin", "early_game", "outplay"],

    # Mid laners
    "Ahri": ["pick", "safe", "ap"],
    "Akali": ["assassin", "outplay", "ap"],
    "Akshan": ["roam", "early_game", "ad"],
    "Anivia": ["scaling", "control", "ap"],
    "Annie": ["burst", "engage", "ap"],
    "AurelionSol": ["scaling", "roam", "ap"],
    "Azir": ["scaling", "hypercarry", "ap"],
    "Cassiopeia": ["scaling", "dps", "ap"],
    "Corki": ["scaling", "poke", "hybrid"],
    "Fizz": ["assassin", "burst", "ap"],
    "Galio": ["teamfight", "engage", "tank"],
    "Hwei": ["poke", "control", "ap"],
    "Irelia": ["early_game", "outplay", "ad"],
    "Kassadin": ["scaling", "hypercarry", "ap"],
    "Katarina": ["reset", "assassin", "ap"],
    "LeBlanc": ["early_game", "assassin", "ap"],
    "Lissandra": ["teamfight", "engage", "ap"],
    "Lux": ["poke", "burst", "ap"],
    "Malzahar": ["scaling", "push", "ap"],
    "Neeko": ["teamfight", "burst", "ap"],
    "Orianna": ["teamfight", "scaling", "ap"],
    "Qiyana": ["assassin", "early_game", "ad"],
    "Ryze": ["scaling", "dps", "ap"],
    "Smolder": ["scaling", "hypercarry", "ad"],
    "Sylas": ["teamfight", "ap", "outplay"],
    "Syndra": ["burst", "scaling", "ap"],
    "TwistedFate": ["roam", "global", "ap"],
    "Veigar": ["scaling", "burst", "ap"],
    "Vex": ["teamfight", "anti_dash", "ap"],
    "Viktor": ["scaling", "control", "ap"],
    "Xerath": ["poke", "artillery", "ap"],
    "Yasuo": ["scaling", "hypercarry", "ad"],
    "Yone": ["scaling", "teamfight", "ad"],
    "Zed": ["assassin", "early_game", "ad"],
    "Ziggs": ["poke", "siege", "ap"],
    "Zoe": ["poke", "pick", "ap"],

    # Bot laners (ADC)
    "Aphelios": ["scaling", "hypercarry", "teamfight"],
    "Ashe": ["utility", "engage", "scaling"],
    "Caitlyn": ["early_game", "siege", "poke"],
    "Draven": ["early_game", "snowball", "hypercarry"],
    "Ezreal": ["safe", "poke", "scaling"],
    "Jhin": ["utility", "pick", "scaling"],
    "Jinx": ["scaling", "hypercarry", "teamfight"],
    "Kaisa": ["scaling", "assassin", "hypercarry"],
    "Kalista": ["early_game", "objective", "utility"],
    "Kogmaw": ["scaling", "hypercarry", "tank_buster"],
    "Lucian": ["early_game", "burst", "lane_bully"],
    "MissFortune": ["teamfight", "early_game", "burst"],
    "Nilah": ["scaling", "melee", "hypercarry"],
    "Samira": ["reset", "teamfight", "hypercarry"],
    "Senna": ["utility", "scaling", "poke"],
    "Sivir": ["scaling", "teamfight", "utility"],
    "Tristana": ["scaling", "siege", "hypercarry"],
    "Twitch": ["scaling", "assassin", "hypercarry"],
    "Varus": ["poke", "utility", "scaling"],
    "Vayne": ["scaling", "tank_buster", "hypercarry"],
    "Xayah": ["safe", "teamfight", "scaling"],
    "Zeri": ["scaling", "hypercarry", "mobile"],
    "Ziggs": ["siege", "poke", "scaling"],

    # Supports
    "Alistar": ["engage", "tank", "teamfight"],
    "Bard": ["roam", "utility", "playmaker"],
    "Blitzcrank": ["pick", "engage", "early_game"],
    "Braum": ["peel", "tank", "teamfight"],
    "Janna": ["peel", "disengage", "enchanter"],
    "Karma": ["poke", "utility", "enchanter"],
    "Leona": ["engage", "tank", "early_game"],
    "Lulu": ["peel", "enchanter", "hypercarry_enabler"],
    "Milio": ["peel", "enchanter", "disengage"],
    "Morgana": ["pick", "peel", "disengage"],
    "Nami": ["sustain", "enchanter", "engage"],
    "Nautilus": ["engage", "tank", "pick"],
    "Poppy": ["counter_engage", "peel", "tank"],
    "Pyke": ["assassin", "pick", "roam"],
    "Rakan": ["engage", "teamfight", "enchanter"],
    "Rell": ["engage", "tank", "teamfight"],
    "Renata": ["peel", "enchanter", "utility"],
    "Senna": ["poke", "scaling", "utility"],
    "Seraphine": ["teamfight", "enchanter", "scaling"],
    "Sona": ["scaling", "teamfight", "enchanter"],
    "Soraka": ["sustain", "peel", "enchanter"],
    "TahmKench": ["peel", "tank", "utility"],
    "Taric": ["teamfight", "peel", "enchanter"],
    "Thresh": ["pick", "playmaker", "peel"],
    "Yuumi": ["enchanter", "hypercarry_enabler", "scaling"],
    "Zilean": ["utility", "scaling", "peel"],
    "Zyra": ["poke", "damage", "teamfight"],

    # New champions (2023-2025)
    "Aurora": ["mage", "ap", "roam"],
    "Ambessa": ["bruiser", "early_game", "dive"],
    "Mel": ["mage", "ap", "utility"],
    "Hwei": ["poke", "control", "ap"],
    "Smolder": ["scaling", "hypercarry", "ad"],
    "Briar": ["early_game", "assassin", "dive"],
    "Naafiri": ["early_game", "assassin", "roam"],

    # Alternative name mappings (normalized versions)
    "BelVeth": ["scaling", "hypercarry", "objective"],
    "KaiSa": ["scaling", "assassin", "hypercarry"],
    "KhaZix": ["assassin", "early_game", "pick"],
    "ChoGath": ["tank", "scaling", "teamfight"],
    "VelKoz": ["poke", "artillery", "ap"],
    "KogMaw": ["scaling", "hypercarry", "tank_buster"],
    "NunuWillump": ["objective", "engage", "tank"],
    "MonkeyKing": ["teamfight", "engage", "bruiser"],  # Wukong alias
    "RenataGlasc": ["peel", "enchanter", "utility"],
    "DrMundo": ["tank", "scaling", "sustain"],
    "JarvanIV": ["early_game", "engage", "teamfight"],
    "MasterYi": ["scaling", "hypercarry", "farm"],
    "LeeSin": ["early_game", "outplay", "playmaker"],
    "TwistedFate": ["roam", "global", "ap"],
    "MissFortune": ["teamfight", "early_game", "burst"],
    "XinZhao": ["early_game", "bruiser", "dive"],
    "AurelionSol": ["scaling", "roam", "ap"],
}

# Default tags for unknown champions
DEFAULT_TAGS = ["unknown"]


def get_champion_tags(champion: str) -> list[str]:
    """Get tags for a champion, with fallback to default."""
    # Normalize champion name (remove spaces, capitalize)
    normalized = champion.replace(" ", "").replace("'", "")
    return CHAMPION_TAGS.get(normalized, CHAMPION_TAGS.get(champion, DEFAULT_TAGS))


def compute_patch_champion_stats(
    champion: str,
    position: str,
    patch: str,
    champion_patch_history: dict,
) -> dict:
    """Compute champion stats for a specific patch.

    Args:
        champion: Champion name
        position: Role (top, jng, mid, bot, sup)
        patch: Patch version (e.g., "14.10")
        champion_patch_history: Dict of (champion, position, patch) -> list of game records

    Returns:
        Dict with patch-specific stats or None if insufficient data
    """
    key = (champion, position.lower(), patch)
    history = champion_patch_history.get(key, [])

    if len(history) < 2:
        # Fall back to overall champion stats if patch-specific data insufficient
        return {
            "patch_win_rate": 0.5,
            "patch_games": 0,
            "patch_pick_rate": 0.0,
            "is_patch_data": False,
        }

    wins = sum(1 for h in history if h.get("is_winner", False))
    total = len(history)

    return {
        "patch_win_rate": wins / total,
        "patch_games": total,
        "patch_pick_rate": 0.0,  # Would need total games in patch
        "is_patch_data": True,
    }


def compute_tournament_features(match, is_playoffs: bool = False) -> dict:
    """Compute tournament stage and pressure features.

    Args:
        match: Match object with tournament info
        is_playoffs: Whether this is a playoff match

    Returns:
        Dict with tournament features
    """
    # Determine stage from split name or playoffs flag
    split = getattr(match, 'split', '') or ''
    playoffs = is_playoffs or getattr(match, 'playoffs', False)

    split_lower = split.lower()

    # Detect tournament stage
    is_finals = 'final' in split_lower or 'grand' in split_lower
    is_semis = 'semi' in split_lower
    is_quarters = 'quarter' in split_lower
    is_groups = 'group' in split_lower or 'stage' in split_lower

    # Stage importance (0-1 scale)
    if is_finals:
        stage_importance = 1.0
        stage_code = 4
    elif is_semis:
        stage_importance = 0.85
        stage_code = 3
    elif is_quarters:
        stage_importance = 0.7
        stage_code = 2
    elif playoffs:
        stage_importance = 0.6
        stage_code = 1
    else:
        stage_importance = 0.3
        stage_code = 0

    return {
        "is_playoffs": 1.0 if playoffs else 0.0,
        "is_finals": 1.0 if is_finals else 0.0,
        "stage_importance": stage_importance,
        "stage_code": stage_code,
    }


def compute_team_comp_features(
    champions: dict[str, str],
    side: str = "blue",
) -> dict:
    """Analyze team composition for strategic features.

    Args:
        champions: Dict mapping position to champion name
                   e.g., {"top": "Gnar", "jng": "LeeSin", ...}
        side: "blue" or "red"

    Returns:
        Dict with composition features
    """
    prefix = f"{side}_"

    # Collect all tags
    all_tags = []
    position_tags = {}

    for pos in ["top", "jng", "mid", "bot", "sup"]:
        champ = champions.get(pos, "")
        tags = get_champion_tags(champ) if champ else DEFAULT_TAGS
        position_tags[pos] = tags
        all_tags.extend(tags)

    # Count tag frequencies
    tag_counts = defaultdict(int)
    for tag in all_tags:
        tag_counts[tag] += 1

    total_tags = len(all_tags) or 1

    # Compute composition scores
    features = {
        # Playstyle indicators (0-1 scale based on tag frequency)
        f"{prefix}comp_early_game": tag_counts.get("early_game", 0) / 5.0,
        f"{prefix}comp_scaling": tag_counts.get("scaling", 0) / 5.0,
        f"{prefix}comp_teamfight": tag_counts.get("teamfight", 0) / 5.0,
        f"{prefix}comp_splitpush": tag_counts.get("splitpush", 0) / 5.0,
        f"{prefix}comp_poke": tag_counts.get("poke", 0) / 5.0,
        f"{prefix}comp_engage": tag_counts.get("engage", 0) / 5.0,
        f"{prefix}comp_pick": tag_counts.get("pick", 0) / 5.0,
        f"{prefix}comp_siege": tag_counts.get("siege", 0) / 5.0,

        # Damage type balance
        f"{prefix}comp_ap_count": sum(1 for pos, tags in position_tags.items() if "ap" in tags),
        f"{prefix}comp_ad_count": sum(1 for pos, tags in position_tags.items() if "ad" in tags),

        # Team structure
        f"{prefix}comp_has_tank": 1.0 if tag_counts.get("tank", 0) > 0 else 0.0,
        f"{prefix}comp_has_engage": 1.0 if tag_counts.get("engage", 0) > 0 else 0.0,
        f"{prefix}comp_has_hypercarry": 1.0 if tag_counts.get("hypercarry", 0) > 0 else 0.0,
        f"{prefix}comp_has_assassin": 1.0 if tag_counts.get("assassin", 0) > 0 else 0.0,
        f"{prefix}comp_has_peel": 1.0 if tag_counts.get("peel", 0) > 0 or tag_counts.get("enchanter", 0) > 0 else 0.0,

        # Synergy indicators
        f"{prefix}comp_hypercarry_with_peel": (
            1.0 if tag_counts.get("hypercarry", 0) > 0 and
            (tag_counts.get("peel", 0) > 0 or tag_counts.get("enchanter", 0) > 0)
            else 0.0
        ),
        f"{prefix}comp_engage_with_followup": (
            1.0 if tag_counts.get("engage", 0) > 0 and tag_counts.get("teamfight", 0) >= 2
            else 0.0
        ),
    }

    return features


def compute_lane_matchup_features(
    blue_champions: dict[str, str],
    red_champions: dict[str, str],
    matchup_history: dict,
) -> dict:
    """Compute lane matchup advantages based on historical data.

    Args:
        blue_champions: Dict of position -> champion for blue side
        red_champions: Dict of position -> champion for red side
        matchup_history: Dict of (champ1, champ2, position) -> list of {winner_is_champ1: bool}

    Returns:
        Dict with matchup features
    """
    features = {}

    for pos in ["top", "jng", "mid", "bot", "sup"]:
        blue_champ = blue_champions.get(pos, "")
        red_champ = red_champions.get(pos, "")

        if not blue_champ or not red_champ:
            features[f"matchup_{pos}_advantage"] = 0.0
            features[f"matchup_{pos}_games"] = 0
            continue

        # Normalize matchup key (alphabetical order)
        if blue_champ < red_champ:
            key = (blue_champ, red_champ, pos)
            is_first = True
        else:
            key = (red_champ, blue_champ, pos)
            is_first = False

        history = matchup_history.get(key, [])

        if len(history) < 3:
            # Insufficient data, use neutral
            features[f"matchup_{pos}_advantage"] = 0.0
            features[f"matchup_{pos}_games"] = len(history)
        else:
            # Calculate win rate from blue's perspective
            if is_first:
                wins = sum(1 for h in history if h.get("winner_is_first", False))
            else:
                wins = sum(1 for h in history if not h.get("winner_is_first", True))

            total = len(history)
            # Convert to advantage (-0.5 to +0.5 scale, 0 = neutral)
            blue_wr = wins / total
            features[f"matchup_{pos}_advantage"] = blue_wr - 0.5
            features[f"matchup_{pos}_games"] = total

    # Aggregate matchup score
    matchup_sum = sum(features.get(f"matchup_{pos}_advantage", 0) for pos in ["top", "jng", "mid", "bot", "sup"])
    features["matchup_total_advantage"] = matchup_sum

    return features


def compute_player_form_features(
    player_id: int,
    position: str,
    player_history: dict,
    window: int = 5,
) -> dict:
    """Compute individual player form based on recent games.

    Args:
        player_id: Database ID of the player
        position: Player's position
        player_history: Dict of player_id -> list of recent game records
        window: Number of recent games to consider

    Returns:
        Dict with player form features
    """
    history = player_history.get(player_id, [])[-window:]

    if len(history) < 2:
        return {
            "player_form_win_rate": 0.5,
            "player_form_avg_kda": 3.0,
            "player_form_avg_cs_per_min": 7.0 if position in ["mid", "bot", "top"] else 4.0,
            "player_form_avg_damage_share": 0.2,
            "player_form_trend": 0.0,
            "player_form_games": len(history),
        }

    n = len(history)
    wins = sum(1 for h in history if h.get("is_winner", False))

    avg_kda = sum(h.get("kda", 0) for h in history) / n
    avg_cs = sum(h.get("cs_per_min", 0) for h in history) / n
    avg_damage = sum(h.get("damage_share", 0.2) for h in history) / n

    # Calculate trend (are they improving or declining?)
    if n >= 4:
        first_half = history[:n//2]
        second_half = history[n//2:]
        first_wr = sum(1 for h in first_half if h.get("is_winner", False)) / len(first_half)
        second_wr = sum(1 for h in second_half if h.get("is_winner", False)) / len(second_half)
        trend = second_wr - first_wr
    else:
        trend = 0.0

    return {
        "player_form_win_rate": wins / n,
        "player_form_avg_kda": avg_kda,
        "player_form_avg_cs_per_min": avg_cs,
        "player_form_avg_damage_share": avg_damage,
        "player_form_trend": trend,
        "player_form_games": n,
    }


def compute_all_player_form_features(
    blue_player_ids: dict[str, int],
    red_player_ids: dict[str, int],
    player_history: dict,
    window: int = 5,
) -> dict:
    """Compute form features for all players in a match.

    Args:
        blue_player_ids: Dict of position -> player_id for blue side
        red_player_ids: Dict of position -> player_id for red side
        player_history: Dict of player_id -> list of recent game records
        window: Number of recent games to consider

    Returns:
        Dict with all player form features
    """
    features = {}

    for pos in ["top", "jng", "mid", "bot", "sup"]:
        # Blue side
        blue_pid = blue_player_ids.get(pos)
        if blue_pid:
            blue_form = compute_player_form_features(blue_pid, pos, player_history, window)
            for key, val in blue_form.items():
                features[f"blue_{pos}_{key}"] = val
        else:
            features[f"blue_{pos}_player_form_win_rate"] = 0.5
            features[f"blue_{pos}_player_form_avg_kda"] = 3.0
            features[f"blue_{pos}_player_form_trend"] = 0.0

        # Red side
        red_pid = red_player_ids.get(pos)
        if red_pid:
            red_form = compute_player_form_features(red_pid, pos, player_history, window)
            for key, val in red_form.items():
                features[f"red_{pos}_{key}"] = val
        else:
            features[f"red_{pos}_player_form_win_rate"] = 0.5
            features[f"red_{pos}_player_form_avg_kda"] = 3.0
            features[f"red_{pos}_player_form_trend"] = 0.0

    # Aggregate team form
    blue_form_sum = sum(
        features.get(f"blue_{pos}_player_form_win_rate", 0.5)
        for pos in ["top", "jng", "mid", "bot", "sup"]
    )
    red_form_sum = sum(
        features.get(f"red_{pos}_player_form_win_rate", 0.5)
        for pos in ["top", "jng", "mid", "bot", "sup"]
    )

    features["blue_team_player_form_avg"] = blue_form_sum / 5.0
    features["red_team_player_form_avg"] = red_form_sum / 5.0
    features["player_form_advantage"] = blue_form_sum - red_form_sum

    return features


def get_advanced_feature_names() -> list[str]:
    """Return the ordered list of advanced feature names."""
    names = []

    # Tournament features (4)
    names.extend([
        "is_playoffs", "is_finals", "stage_importance", "stage_code"
    ])

    # Team comp features (17 per side = 34)
    for side in ["blue", "red"]:
        names.extend([
            f"{side}_comp_early_game",
            f"{side}_comp_scaling",
            f"{side}_comp_teamfight",
            f"{side}_comp_splitpush",
            f"{side}_comp_poke",
            f"{side}_comp_engage",
            f"{side}_comp_pick",
            f"{side}_comp_ap_count",
            f"{side}_comp_ad_count",
            f"{side}_comp_has_tank",
            f"{side}_comp_has_engage",
            f"{side}_comp_has_hypercarry",
            f"{side}_comp_has_assassin",
            f"{side}_comp_has_peel",
            f"{side}_comp_hypercarry_with_peel",
            f"{side}_comp_engage_with_followup",
        ])

    # Comp differential features (8)
    names.extend([
        "comp_diff_early_game",
        "comp_diff_scaling",
        "comp_diff_teamfight",
        "comp_diff_engage",
    ])

    # Lane matchup features (11)
    for pos in ["top", "jng", "mid", "bot", "sup"]:
        names.extend([
            f"matchup_{pos}_advantage",
            f"matchup_{pos}_games",
        ])
    names.append("matchup_total_advantage")

    # Player form features (simplified: 6 per position × 10 positions = 60, plus 3 aggregates = 63)
    for side in ["blue", "red"]:
        for pos in ["top", "jng", "mid", "bot", "sup"]:
            names.extend([
                f"{side}_{pos}_player_form_win_rate",
                f"{side}_{pos}_player_form_avg_kda",
                f"{side}_{pos}_player_form_trend",
            ])
    names.extend([
        "blue_team_player_form_avg",
        "red_team_player_form_avg",
        "player_form_advantage",
    ])

    # Patch features (4)
    names.extend([
        "patch_numeric",
        "avg_blue_patch_champ_wr",
        "avg_red_patch_champ_wr",
        "patch_champ_wr_diff",
    ])

    return names


def parse_patch_to_numeric(patch: str) -> float:
    """Convert patch string to numeric value.

    Args:
        patch: Patch string like "14.10" or "14.10.1"

    Returns:
        Numeric value like 1410 or 1410.1
    """
    if not patch:
        return 0.0

    try:
        parts = patch.split(".")
        if len(parts) >= 2:
            major = int(parts[0])
            minor = int(parts[1])
            micro = float(parts[2]) / 10 if len(parts) > 2 else 0
            return major * 100 + minor + micro
        return 0.0
    except (ValueError, IndexError):
        return 0.0
