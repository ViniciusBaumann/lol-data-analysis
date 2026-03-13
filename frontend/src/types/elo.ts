import type { TeamMin } from './common';

export interface EloRating {
  rank: number;
  team: TeamMin;
  elo_rating: number;
  elo_rating_blue: number;
  elo_rating_red: number;
  last_change: number;
  last_change_blue: number;
  last_change_red: number;
  matches_played: number;
  last_match_date: string | null;
}

export interface LeagueStandings {
  league: {
    id: number;
    name: string;
  };
  teams: {
    id: number;
    name: string;
    short_name: string;
    total_matches: number;
    wins: number;
    losses: number;
    win_rate: number;
  }[];
}
