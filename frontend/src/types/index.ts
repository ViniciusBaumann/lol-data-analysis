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
}

export interface CompareMatchDetail {
  match_id: number;
  date: string | null;
  opponent: string;
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
}

export interface CompareFaceoffMatch {
  match_id: number;
  date: string | null;
  league: string;
  team1: CompareFaceoffMatchTeam;
  team2: CompareFaceoffMatchTeam;
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
}

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

export interface ScheduledMatchTeam {
  name: string;
  code: string;
  image: string;
  result: { outcome: string | null; gameWins: number } | null;
}

export interface ScheduledMatch {
  startTime: string;
  state: 'unstarted' | 'inProgress';
  type: string;
  blockName: string;
  match: {
    id: string;
    strategy: { type: string; count: number };
    teams: ScheduledMatchTeam[];
  };
}

export interface ScheduleResponse {
  events: ScheduledMatch[];
  message?: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ImportResult {
  id: number;
  year: number;
  source: string;
  rows_processed: number;
  matches_created: number;
  matches_skipped: number;
  errors: string;
  status: string;
  started_at: string;
  completed_at: string | null;
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

export interface FilterParams {
  league?: number;
  year?: number;
  split?: string;
  patch?: string;
  date_from?: string;
  date_to?: string;
}

export interface MatchPredictions {
  team1_win_prob: number;
  team2_win_prob: number;
  total_kills: number;
  total_dragons: number;
  total_towers: number;
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
