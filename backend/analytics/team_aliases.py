"""Team name aliases for matching LoL Esports API team names to database entries.

This module contains mappings from various team name variations used in the
LoL Esports API to the canonical team names stored in the database.
"""

# Known aliases for teams with different names in LoL Esports API vs database
TEAM_NAME_ALIASES: dict[str, str] = {
    # ===== LPL Teams =====
    # EDward Gaming variations
    "shanghai edward gaming hycan": "edward gaming",
    "edward gaming hycan": "edward gaming",
    "shanghai edg hycan": "edward gaming",
    "edg hycan": "edward gaming",
    "edg": "edward gaming",
    # Ninjas in Pyjamas variations
    "shenzhen ninjas in pyjamas": "ninjas in pyjamas",
    "shenzhen nip": "ninjas in pyjamas",
    "nip": "ninjas in pyjamas",
    # JD Gaming variations
    "jingdong gaming": "jd gaming",
    "beijing jd gaming": "jd gaming",
    "jdg": "jd gaming",
    "jd": "jd gaming",
    # Bilibili Gaming variations
    "hangzhou bilibili gaming": "bilibili gaming",
    "bilibili": "bilibili gaming",
    "blg": "bilibili gaming",
    # Top Esports variations
    "topsports gaming": "top esports",
    "shanghai top esports": "top esports",
    "tes": "top esports",
    # Weibo Gaming variations
    "suning gaming": "weibo gaming",
    "suning": "weibo gaming",
    "wbg": "weibo gaming",
    "weibo": "weibo gaming",
    # LNG Esports variations
    "suzhou lng esports": "lng esports",
    "li-ning gaming": "lng esports",
    "lng": "lng esports",
    # Invictus Gaming variations
    "shanghai invictus gaming": "invictus gaming",
    "ig": "invictus gaming",
    # Royal Never Give Up variations
    "royal never give up": "royal never give up",
    "rng": "royal never give up",
    # FunPlus Phoenix variations
    "funplus phoenix": "funplus phoenix",
    "fpx": "funplus phoenix",
    # Oh My God variations
    "omg": "oh my god",
    # LGD Gaming variations
    "hangzhou lgd gaming": "lgd gaming",
    "lgd": "lgd gaming",
    # Team WE variations
    "xian team we": "team we",
    "we": "team we",
    # ThunderTalk Gaming variations
    "foshan thundertalk gaming": "thundertalk gaming",
    "tt gaming": "thundertalk gaming",
    "thundertalk": "thundertalk gaming",
    "tt": "thundertalk gaming",
    # Ultra Prime variations
    "guangzhou ultra prime": "ultra prime",
    "up": "ultra prime",
    # Anyone's Legend variations
    "hangzhou anyone's legend": "anyone's legend",
    "anyones legend": "anyone's legend",
    "anyone's legend": "anyone's legend",
    "al": "anyone's legend",
    # Rare Atom variations
    "beijing rare atom": "rare atom",
    "ra": "rare atom",

    # ===== LCK Teams =====
    "t1": "t1",
    "sk telecom t1": "t1",
    "skt": "t1",
    "gen.g": "gen.g",
    "geng": "gen.g",
    "samsung galaxy": "gen.g",
    "hanwha life esports": "hanwha life esports",
    "hle": "hanwha life esports",
    "kt rolster": "kt rolster",
    "kt": "kt rolster",
    "dplus kia": "dplus kia",
    "dk": "dplus kia",
    "damwon": "dplus kia",
    "damwon kia": "dplus kia",
    "kwangdong freecs": "kwangdong freecs",
    "kdf": "kwangdong freecs",
    "drx": "drx",
    "nongshim redforce": "nongshim redforce",
    "ns": "nongshim redforce",
    "brion": "ok brion",
    "ok brion": "ok brion",
    "fearx": "fearx",

    # ===== LEC Teams =====
    "g2 esports": "g2 esports",
    "g2": "g2 esports",
    "fnatic": "fnatic",
    "fnc": "fnatic",
    "mad lions": "mad lions",
    "mad": "mad lions",
    "team vitality": "team vitality",
    "vit": "team vitality",
    "rogue": "rogue",
    "team heretics": "team heretics",
    "th": "team heretics",
    "karmine corp": "karmine corp",
    "kc": "karmine corp",
    "giantx": "giantx",
    "gx": "giantx",
    "team bds": "team bds",
    "bds": "team bds",
    "sk gaming": "sk gaming",
    "sk": "sk gaming",

    # ===== LCS Teams =====
    "cloud9": "cloud9",
    "c9": "cloud9",
    "team liquid": "team liquid",
    "tl": "team liquid",
    "flyquest": "flyquest",
    "fly": "flyquest",
    "100 thieves": "100 thieves",
    "100t": "100 thieves",
    "dignitas": "dignitas",
    "dig": "dignitas",
    "nrg": "nrg",
    "shopify rebellion": "shopify rebellion",

    # ===== CBLOL (Brazil) =====
    "loud": "loud",
    "pain gaming": "pain gaming",
    "pain": "pain gaming",
    "furia": "furia",
    "furia esports": "furia",
    "red canids": "red canids",
    "red": "red canids",
    "fluxo w7m": "fluxo w7m",
    "fluxo": "fluxo w7m",
    "vivo keyd stars": "vivo keyd stars",
    "keyd stars": "vivo keyd stars",
    "keyd": "vivo keyd stars",
    "leviatan": "leviatan",
    "lev": "leviatan",
    "los grandes": "los grandes",
    "los": "los grandes",
    "isurus": "isurus",

    # ===== LCP (Pacific) =====
    "gam esports": "gam esports",
    "gam": "gam esports",
    "detonation focusme": "detonation focusme",
    "dfm": "detonation focusme",
    "fukuoka softbank hawks gaming": "fukuoka softbank hawks gaming",
    "shg": "fukuoka softbank hawks gaming",
    "softbank hawks": "fukuoka softbank hawks gaming",
    "deep cross gaming": "deep cross gaming",
    "dcg": "deep cross gaming",
    "ctbc flying oyster": "ctbc flying oyster",
    "cfo": "ctbc flying oyster",
    "ground zero gaming": "ground zero gaming",
    "gzg": "ground zero gaming",
    "team secret whales": "team secret whales",
    "tsw": "team secret whales",
    "mvk esports": "mvk esports",
    "mvk": "mvk esports",

    # ===== TCL (Turkey) =====
    "dark passage": "dark passage",
    "dp": "dark passage",
    "bushido wildcats": "bushido wildcats",
    "bwc": "bushido wildcats",
    "wildcats": "bushido wildcats",
    "boostgate esports": "boostgate esports",
    "boostgate": "boostgate esports",
    "s2g esports": "s2g esports",
    "s2g": "s2g esports",
    "su esports": "su esports",
    "supermassive": "su esports",
    "team phoenix": "team phoenix",
    "phx": "team phoenix",

    # ===== LFL (France) =====
    "karmine corp blue": "karmine corp blue",
    "karmine corp blue stars": "karmine corp blue stars",
    "vitality.bee": "vitality.bee",
    "vitality bee": "vitality.bee",
    "bk rog esports": "bk rog esports",
    "bk rog": "bk rog esports",
    "solary": "solary",
    "ldlc og": "ldlc og",
    "ldlc": "ldlc og",
    "joblife": "joblife",

    # ===== LCKC (Korea Challengers) =====
    "t1 esports academy": "t1 esports academy",
    "t1a": "t1 esports academy",
    "gen.g global academy": "gen.g global academy",
    "geng academy": "gen.g global academy",
    "dk challengers": "dplus kia challengers",
    "dplus kia challengers": "dplus kia challengers",

    # ===== NLC / Nordic =====
    "natus vincere": "natus vincere",
    "navi": "natus vincere",

    # ===== LVP SuperLiga (Spain) =====
    "movistar koi": "movistar koi",
    "koi": "movistar koi",
    "los ratones": "los ratones",

    # ===== Swiss / EBL / Other Regional =====
    "lund esports organization": "lund esports organization",
    "leo": "lund esports organization",
    "lausanne esports": "lausanne esports",
    "els": "lausanne esports",
    "observant force": "observant force",
    "obfe": "observant force",
}
