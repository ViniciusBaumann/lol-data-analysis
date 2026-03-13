import type { TeamMin } from './common';

export interface CompareSideStats {
  total: number;
  first_blood: number;
  first_tower: number;
  first_dragon: number;
  first_baron: number;
}

export interface CompareTeamRates {
  total: number;
  wins: number;
  losses: number;
  win_rate: number;
  first_blood_rate: number;
  first_tower_rate: number;
  first_dragon_rate: number;
  first_herald_rate: number;
  first_baron_rate: number;
  first_inhibitor_rate: number;
  most_kills_rate: number;
  avg_kills: number;
  avg_towers: number;
  avg_dragons: number;
  avg_barons: number;
  avg_inhibitors: number;
  avg_game_length: number | null;
  avg_kill_diff: number;
  avg_tower_diff: number;
  side_stats?: {
    blue: CompareSideStats;
    red: CompareSideStats;
  };
}

export interface CompareMatchDetail {
  match_id: number;
  date: string | null;
  opponent: string;
  side: 'Blue' | 'Red';
  is_winner: boolean;
  first_blood: boolean;
  first_tower: boolean;
  first_dragon: boolean;
  first_herald: boolean;
  first_baron: boolean;
  first_inhibitor: boolean;
  most_kills: boolean;
  kills: number;
  towers: number;
  dragons: number;
  barons: number;
  inhibitors: number;
  game_length: number | null;
  kill_diff: number;
  tower_diff: number;
  opp_kills: number;
  opp_towers: number;
  opp_dragons: number;
  opp_barons: number;
}

export interface CompareFaceoffMatchTeam {
  is_winner: boolean;
  first_blood: boolean;
  first_tower: boolean;
  first_dragon: boolean;
  first_herald: boolean;
  first_baron: boolean;
  first_inhibitor: boolean;
  most_kills: boolean;
  kills: number;
  towers: number;
  dragons: number;
  barons: number;
  inhibitors: number;
  game_length: number | null;
  kill_diff: number;
  tower_diff: number;
}

export interface CompareFaceoffMatch {
  match_id: number;
  date: string | null;
  league: string;
  team1: CompareFaceoffMatchTeam;
  team2: CompareFaceoffMatchTeam;
}

export interface CompareEloData {
  global: number;
  blue: number;
  red: number;
  last_change: number;
}

export interface CompareData {
  team1_info: TeamMin;
  team2_info: TeamMin;
  year: number;
  split: string;
  overall: {
    split: {
      label: string;
      team1: CompareTeamRates;
      team2: CompareTeamRates;
    };
    season: {
      label: string;
      team1: CompareTeamRates;
      team2: CompareTeamRates;
    };
  };
  recent: {
    team1: {
      last5: CompareTeamRates;
      last10: CompareTeamRates;
      matches: CompareMatchDetail[];
    };
    team2: {
      last5: CompareTeamRates;
      last10: CompareTeamRates;
      matches: CompareMatchDetail[];
    };
  };
  faceoffs: {
    total: number;
    team1_wins: number;
    team2_wins: number;
    team1: CompareTeamRates;
    team2: CompareTeamRates;
    matches: CompareFaceoffMatch[];
  };
  elo?: {
    team1: CompareEloData | null;
    team2: CompareEloData | null;
  };
}
