import type { DraftPredictions, CompositionAnalysis, ChampionPowerSpike, LiveGameDraft } from './draft';
import type { LiveGameEnrichment } from './enrichment';
import type { SeriesGame, DraftPools } from './series';

export interface LiveGameTeam {
  name: string;
  code: string;
  image: string;
  result: { outcome: string | null; gameWins: number } | null;
  db_team_id: number | null;
}

export interface LiveGameStats {
  blue_kills: number;
  red_kills: number;
  blue_gold: number;
  red_gold: number;
  blue_towers: number;
  red_towers: number;
  blue_dragons: number;
  red_dragons: number;
  blue_barons: number;
  red_barons: number;
  blue_inhibitors: number;
  red_inhibitors: number;
  game_time_sec: number | null;
}

export interface LivePlayerStats {
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
  currentHealth: number;
  maxHealth: number;
  items: number[];
  wardsPlaced: number;
  wardsDestroyed: number;
  killParticipation: number;
  championDamageShare: number;
}

export interface LiveGamePlayers {
  blue: LivePlayerStats[];
  red: LivePlayerStats[];
}

export interface LiveGamePrediction {
  predictions: DraftPredictions | null;
  composition?: CompositionAnalysis;
  power_spikes?: Record<string, ChampionPowerSpike> | null;
  features_available: boolean;
  models_loaded: boolean;
  teams_provided?: boolean;
  message?: string;
}

export interface LiveGame {
  match_id: string;
  game_id: string | null;
  start_time: string;
  league: { name: string; slug: string; image: string };
  block_name: string;
  strategy: { type: string; count: number };
  stats_enabled: boolean;
  patch_version: string;
  ddragon_version: string;
  blue_team: LiveGameTeam;
  red_team: LiveGameTeam;
  draft: LiveGameDraft | null;
  live_stats: LiveGameStats | null;
  players: LiveGamePlayers | null;
  prediction: LiveGamePrediction | null;
  enrichment: LiveGameEnrichment | null;
  series_games: SeriesGame[] | null;
  draft_pools: DraftPools | null;
}

export interface LiveGamesResponse {
  games: LiveGame[];
  count: number;
}
