import type { TeamMin } from './common';

export interface MatchPredictions {
  team1_win_prob: number;
  team2_win_prob: number;
  total_kills: number;
  total_dragons: number;
  total_towers: number;
  total_barons: number;
  game_time: number;
}

export interface PredictionResponse {
  team1_info: TeamMin;
  team2_info: TeamMin;
  predictions: MatchPredictions | null;
  features_available: boolean;
  models_loaded: boolean;
  message?: string;
}
