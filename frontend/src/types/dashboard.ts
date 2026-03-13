import type { Match } from './match';

export interface DashboardData {
  total_matches: number;
  total_teams: number;
  total_players: number;
  total_leagues: number;
  recent_matches: Match[];
  top_teams: {
    id: number;
    name: string;
    short_name: string;
    total_matches: number;
    wins: number;
    win_rate: number;
  }[];
  side_stats: {
    blue_wins: number;
    red_wins: number;
    total: number;
  };
  league_distribution: {
    league_name: string;
    match_count: number;
  }[];
}
