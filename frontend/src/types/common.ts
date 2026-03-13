export interface League {
  id: number;
  name: string;
  slug: string;
  region: string;
  total_matches: number;
  created_at: string;
  updated_at: string;
}

export interface TeamMin {
  id: number;
  name: string;
  short_name: string;
}

export interface Team {
  id: number;
  name: string;
  slug: string;
  short_name: string;
  oe_teamid: string | null;
  leagues: League[];
  total_matches: number;
  win_rate: number;
  created_at: string;
}

export interface TeamDetail extends Team {
  players: Player[];
}

export interface Player {
  id: number;
  name: string;
  oe_playerid: string | null;
  position: string;
  team: number | null;
  created_at: string;
}

export interface FilterParams {
  league?: number;
  year?: number;
  split?: string;
  patch?: string;
  date_from?: string;
  date_to?: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
