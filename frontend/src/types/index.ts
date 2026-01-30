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
}

export interface DraftPredictionResponse {
  predictions: DraftPredictions | null;
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

export interface LiveGameTeam {
  name: string;
  code: string;
  image: string;
  result: { outcome: string | null; gameWins: number } | null;
  db_team_id: number | null;
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
  features_available: boolean;
  models_loaded: boolean;
  teams_provided?: boolean;
  message?: string;
}

// ---------- Enrichment types ----------

export interface PlayerChampionStats {
  player_name: string;
  games: number;
  wins: number;
  win_rate: number;
}

export interface LaneMatchup {
  position: string;
  blue_champion: string;
  red_champion: string;
  blue_win_rate: number | null;
  red_win_rate: number | null;
  blue_wins: number;
  red_wins: number;
  games: number;
  blue_player_stats?: PlayerChampionStats | null;
  red_player_stats?: PlayerChampionStats | null;
}

export interface SynergyPair {
  champion1: string;
  position1: string;
  champion2: string;
  position2: string;
  games: number;
  wins: number;
  win_rate: number;
}

export interface ChampionSlotStats {
  win_rate: number;
  avg_kda: number;
  avg_kills: number;
  avg_deaths: number;
  avg_gold_per_min: number;
  avg_damage_per_min: number;
  avg_cs_per_min: number;
  games_played: number;
}

export interface TeamEloInfo {
  global: number;
  blue: number;
  red: number;
}

export interface TeamContextStats {
  win_rate: number;
  avg_kills: number;
  avg_deaths: number;
  avg_towers: number;
  avg_dragons: number;
  avg_barons: number;
  first_blood_rate: number;
  first_tower_rate: number;
  avg_golddiffat15: number;
  avg_game_length: number;
  win_rate_last3: number;
  win_rate_last5: number;
  streak: number;
  blue_win_rate: number;
  red_win_rate: number;
}

export interface RecentMatch {
  date: string | null;
  opponent_code: string;
  opponent_image: string | null;
  side: 'Blue' | 'Red';
  won: boolean;
}

export interface TeamContextEntry {
  elo: TeamEloInfo;
  stats: TeamContextStats | null;
  recent_matches: RecentMatch[];
}

export interface H2HContext {
  total_games: number;
  blue_win_rate: number;
  red_win_rate: number;
  recent_form_blue: number;
}

export interface TeamContext {
  blue_team: TeamContextEntry;
  red_team: TeamContextEntry;
  h2h: H2HContext;
}

export interface MatchPredictionEnriched {
  blue_win_prob?: number;
  red_win_prob?: number;
  total_kills?: number;
  total_towers?: number;
  total_dragons?: number;
  total_barons?: number;
  game_time?: number;
  error?: string;
  features_available?: boolean;
  models_loaded?: boolean;
}

export interface LiveGameEnrichment {
  lane_matchups: LaneMatchup[] | null;
  synergies: {
    blue: SynergyPair[];
    red: SynergyPair[];
  } | null;
  champion_stats: Record<string, ChampionSlotStats | null> | null;
  team_context: TeamContext | null;
  match_prediction: MatchPredictionEnriched | null;
}

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

export interface SeriesGame {
  number: number;
  game_id: string | null;
  state: 'completed' | 'inProgress' | 'unstarted';
  is_current: boolean;
  blue_team: SeriesGameTeam;
  red_team: SeriesGameTeam;
  draft: LiveGameDraft | null;
  final_stats: SeriesGameStats | null;
  players: SeriesGamePlayers | null;
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
}

export interface LiveGamesResponse {
  games: LiveGame[];
  count: number;
}

export interface ScheduleTeam {
  name: string;
  code: string;
  image: string;
  result: { outcome: string | null; gameWins: number } | null;
  db_id: number | null;
}

export interface ScheduleMatch {
  match_id: string;
  start_time: string;
  state: 'unstarted' | 'completed';
  block_name: string;
  strategy: { type: string; count: number };
  league: { name: string; slug: string; image: string };
  teams: ScheduleTeam[];
}

export interface ScheduleResponse {
  upcoming: ScheduleMatch[];
  live: ScheduleMatch[];
  completed: ScheduleMatch[];
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
