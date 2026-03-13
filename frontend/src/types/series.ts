import type { DraftPredictions, CompositionAnalysis, LiveGameDraft } from './draft';
import type { MatchPredictionEnriched } from './enrichment';

export interface SeriesGameTeam {
  code: string;
  name: string;
  image: string;
}

export interface SeriesGameStats {
  blue_kills: number;
  red_kills: number;
  blue_gold: number;
  red_gold: number;
  blue_towers: number;
  red_towers: number;
  blue_inhibitors: number;
  red_inhibitors: number;
  blue_dragons: number;
  red_dragons: number;
  blue_barons: number;
  red_barons: number;
  winner?: string;
  game_length?: number | null;
  game_time_sec?: number | null;
  source?: string;
}

export interface SeriesGamePlayer {
  participantId: number;
  side: string;
  role: string;
  champion: string;
  championKey: string;
  summonerName: string;
  level: number;
  kills: number;
  deaths: number;
  assists: number;
  creepScore: number;
  totalGold: number;
  items: number[];
}

export interface SeriesGamePlayers {
  blue: SeriesGamePlayer[];
  red: SeriesGamePlayer[];
}

export interface SavedPrediction {
  predictions: DraftPredictions | null;
  composition?: CompositionAnalysis | null;
  match_prediction?: MatchPredictionEnriched | null;
}

export interface SeriesGame {
  number: number;
  game_id: string | null;
  state: 'completed' | 'inProgress' | 'unstarted' | 'unneeded';
  is_current: boolean;
  blue_team: SeriesGameTeam;
  red_team: SeriesGameTeam;
  draft: LiveGameDraft | null;
  final_stats: SeriesGameStats | null;
  players: SeriesGamePlayers | null;
  saved_prediction?: SavedPrediction | null;
}

export interface DraftPoolChampion {
  champion: string;
  games: number;
  wins: number;
  win_rate: number;
}

export interface DraftPools {
  blue: Record<string, DraftPoolChampion[]>;
  red: Record<string, DraftPoolChampion[]>;
}
