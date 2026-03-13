export interface PlayerChampionStats {
  player_name: string;
  games: number;
  wins: number;
  win_rate: number;
}

export interface LaneMatchup {
  position: string;
  blue_champion: string;
  red_champion: string;
  blue_win_rate: number | null;
  red_win_rate: number | null;
  blue_wins: number;
  red_wins: number;
  games: number;
  blue_player_stats?: PlayerChampionStats | null;
  red_player_stats?: PlayerChampionStats | null;
}

export interface SynergyPair {
  champion1: string;
  position1: string;
  champion2: string;
  position2: string;
  games: number;
  wins: number;
  win_rate: number;
}

export interface ChampionSlotStats {
  win_rate: number;
  avg_kda: number;
  avg_kills: number;
  avg_deaths: number;
  avg_gold_per_min: number;
  avg_damage_per_min: number;
  avg_cs_per_min: number;
  games_played: number;
}

export interface TeamEloInfo {
  global: number;
  blue: number;
  red: number;
}

export interface TeamContextStats {
  win_rate: number;
  avg_kills: number;
  avg_deaths: number;
  avg_towers: number;
  avg_dragons: number;
  avg_barons: number;
  first_blood_rate: number;
  first_tower_rate: number;
  avg_golddiffat15: number;
  avg_game_length: number;
  win_rate_last3: number;
  win_rate_last5: number;
  streak: number;
  blue_win_rate: number;
  red_win_rate: number;
}

export interface RecentMatch {
  date: string | null;
  opponent_code: string;
  opponent_image: string | null;
  side: 'Blue' | 'Red';
  won: boolean;
}

export interface TeamContextEntry {
  elo: TeamEloInfo;
  stats: TeamContextStats | null;
  recent_matches: RecentMatch[];
}

export interface H2HContext {
  total_games: number;
  blue_win_rate: number;
  red_win_rate: number;
  recent_form_blue: number;
}

export interface TeamContext {
  blue_team: TeamContextEntry;
  red_team: TeamContextEntry;
  h2h: H2HContext;
}

export interface MatchPredictionEnriched {
  blue_win_prob?: number;
  red_win_prob?: number;
  total_kills?: number;
  total_towers?: number;
  total_dragons?: number;
  total_barons?: number;
  game_time?: number;
  kills_range?: [number, number];
  towers_range?: [number, number];
  dragons_range?: [number, number];
  barons_range?: [number, number];
  game_time_range?: [number, number];
  error?: string;
  features_available?: boolean;
  models_loaded?: boolean;
}

export interface LiveGameEnrichment {
  lane_matchups: LaneMatchup[] | null;
  synergies: {
    blue: SynergyPair[];
    red: SynergyPair[];
  } | null;
  champion_stats: Record<string, ChampionSlotStats | null> | null;
  team_context: TeamContext | null;
  match_prediction: MatchPredictionEnriched | null;
}
