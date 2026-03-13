import type { League, TeamMin } from './common';

export interface Match {
  id: number;
  gameid: string;
  league: League;
  year: number;
  split: string;
  patch: string;
  date: string | null;
  blue_team: TeamMin;
  red_team: TeamMin;
  winner: TeamMin | null;
  game_length: number | null;
  playoffs: boolean;
}

export interface TeamMatchStats {
  id: number;
  match: number;
  team: number;
  team_name: string;
  side: string;
  is_winner: boolean;
  kills: number;
  deaths: number;
  assists: number;
  total_gold: number;
  dragons: number;
  barons: number;
  towers: number;
  heralds: number;
  voidgrubs: number;
  inhibitors: number;
  first_blood: boolean;
  first_dragon: boolean;
  first_herald: boolean;
  first_baron: boolean;
  first_tower: boolean;
  golddiffat10: number | null;
  golddiffat15: number | null;
  xpdiffat10: number | null;
  xpdiffat15: number | null;
  csdiffat10: number | null;
  csdiffat15: number | null;
}

export interface PlayerMatchStats {
  id: number;
  match: number;
  player: number;
  player_name: string;
  team: number;
  team_name: string;
  position: string;
  champion: string;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  total_gold: number;
  damage_to_champions: number;
  vision_score: number;
  wards_placed: number;
  wards_destroyed: number;
  kda: number;
  cs_per_min: number;
  gold_per_min: number;
  damage_per_min: number;
}

export interface MatchDetail extends Match {
  team_stats: TeamMatchStats[];
  player_stats: PlayerMatchStats[];
}

export interface TeamStats {
  total_matches: number;
  wins: number;
  losses: number;
  win_rate: number;
  avg_kills: number;
  avg_deaths: number;
  avg_assists: number;
  avg_gold: number;
  avg_dragons: number;
  avg_barons: number;
  avg_towers: number;
  avg_heralds: number;
  avg_voidgrubs: number;
  avg_inhibitors: number;
  first_blood_rate: number;
  first_dragon_rate: number;
  first_herald_rate: number;
  first_baron_rate: number;
  first_tower_rate: number;
  first_inhibitor_rate: number;
  kills_over_25_rate: number;
  towers_over_10_rate: number;
  avg_golddiffat10: number;
  avg_golddiffat15: number;
  avg_xpdiffat10: number;
  avg_xpdiffat15: number;
  blue_wins: number;
  blue_total: number;
  blue_win_rate: number;
  red_wins: number;
  red_total: number;
  red_win_rate: number;
  avg_game_length: number;
  form_last5: number;
  form_last10: number;
}

export interface ObjectiveStats {
  avg_dragons: number;
  avg_barons: number;
  avg_towers: number;
  avg_heralds: number;
  avg_voidgrubs: number;
  avg_inhibitors: number;
  first_dragon_rate: number;
  first_baron_rate: number;
  first_tower_rate: number;
  first_herald_rate: number;
  first_blood_rate: number;
  first_inhibitor_rate: number;
}
