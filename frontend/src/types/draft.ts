export interface ChampionInfo {
  champion: string;
  games: number;
  win_rate: number;
  avg_kills: number;
  avg_deaths: number;
  avg_assists: number;
  avg_kda: number;
  avg_cs_per_min: number;
  avg_gold_per_min: number;
  avg_damage_per_min: number;
  positions: { position: string; games: number }[];
}

export interface DraftPredictions {
  blue_win_prob: number;
  red_win_prob: number;
  total_kills: number;
  total_towers: number;
  total_dragons: number;
  total_barons: number;
  kills_range?: [number, number];
  towers_range?: [number, number];
  dragons_range?: [number, number];
  barons_range?: [number, number];
}

export interface CompositionScores {
  early_game: number;
  scaling: number;
  teamfight: number;
  splitpush: number;
  poke: number;
  engage: number;
  pick: number;
  siege: number;
  ap_count: number;
  ad_count: number;
}

export interface CompositionAnalysis {
  blue: CompositionScores;
  red: CompositionScores;
}

export interface ChampionPowerSpike {
  champion: string;
  items: number;
  gold_threshold: number;
  spike_tag: string;
  avg_gold_per_min: number;
  spike_time_min: number;
}

export interface DraftPredictionResponse {
  predictions: DraftPredictions | null;
  composition?: CompositionAnalysis;
  power_spikes?: Record<string, ChampionPowerSpike> | null;
  features_available: boolean;
  models_loaded: boolean;
  teams_provided?: boolean;
  message?: string;
}

export interface MatchupResult {
  champion: string;
  position: string;
  games: number;
  wins: number;
  losses: number;
  win_rate: number;
}

export interface DuoResult {
  champion1: string;
  position1: string;
  champion2: string;
  position2: string;
  games: number;
  wins: number;
  losses: number;
  win_rate: number;
}

export interface MatchupResponse {
  champion?: string;
  position?: string;
  mode: string;
  results: MatchupResult[] | DuoResult[];
}

export interface LiveGameDraft {
  blue_top: string;
  blue_jng: string;
  blue_mid: string;
  blue_bot: string;
  blue_sup: string;
  red_top: string;
  red_jng: string;
  red_mid: string;
  red_bot: string;
  red_sup: string;
}
