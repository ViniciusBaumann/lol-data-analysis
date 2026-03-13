import { Link } from 'react-router-dom';
import { ChevronLeft, FlaskConical } from 'lucide-react';
import {
  GameScoreboard,
  SeriesHeader,
  SeriesTimeline,
  AwaitingStartPanel,
  LaneMatchupsPanel,
  PlayerChampionHistoryPanel,
  TeamContextPanel,
  SynergiesPanel,
  MatchPredictionPanel,
  SeriesAnalysisPanel,
} from '@/components/live';
import type {
  LiveGame,
  SeriesGame,
  LiveGameDraft,
  LiveGameEnrichment,
  LiveGamePrediction,
  LiveGameTeam,
  SeriesGameStats,
  SeriesGamePlayers,
  SeriesGamePlayer,
  CompositionAnalysis,
  TeamContext,
  LaneMatchup,
  SynergyPair,
} from '@/types';

// ---------------------------------------------------------------------------
// Mock Data: LOUD vs RED — Bo3 Series
// ---------------------------------------------------------------------------

const DDRAGON = '15.3.1';

// --- Teams ---
const LOUD_TEAM: LiveGameTeam = {
  name: 'LOUD',
  code: 'LLL',
  image: 'https://am-a.akamaihd.net/image?resize=72:&f=http%3A%2F%2Fstatic.lolesports.com%2Fteams%2FLOUD-logo-offwhite.png',
  result: { outcome: null, gameWins: 1 },
  db_team_id: 101,
};

const RED_TEAM: LiveGameTeam = {
  name: 'RED Canids',
  code: 'RED',
  image: 'https://am-a.akamaihd.net/image?resize=72:&f=http%3A%2F%2Fstatic.lolesports.com%2Fteams%2F1631819614211_red-canids-2021.png',
  result: { outcome: null, gameWins: 1 },
  db_team_id: 102,
};

// --- Game 1 Draft: LOUD (Blue) vs RED (Red) — LOUD wins ---
const GAME1_DRAFT: LiveGameDraft = {
  blue_top: 'Rumble',
  blue_jng: 'Lee Sin',
  blue_mid: 'Azir',
  blue_bot: 'Jinx',
  blue_sup: 'Thresh',
  red_top: 'Aatrox',
  red_jng: 'Viego',
  red_mid: 'Orianna',
  red_bot: "Kai'Sa",
  red_sup: 'Nautilus',
};

const GAME1_STATS: SeriesGameStats = {
  blue_kills: 18,
  red_kills: 9,
  blue_gold: 62400,
  red_gold: 51800,
  blue_towers: 9,
  red_towers: 3,
  blue_inhibitors: 2,
  red_inhibitors: 0,
  blue_dragons: 4,
  red_dragons: 1,
  blue_barons: 2,
  red_barons: 0,
};

function makePlayer(
  id: number, side: string, role: string, champ: string, champKey: string,
  name: string, level: number, k: number, d: number, a: number,
  cs: number, gold: number, items: number[],
): SeriesGamePlayer {
  return {
    participantId: id, side, role, champion: champ, championKey: champKey,
    summonerName: name, level, kills: k, deaths: d, assists: a,
    creepScore: cs, totalGold: gold, items,
  };
}

const GAME1_PLAYERS: SeriesGamePlayers = {
  blue: [
    makePlayer(1, 'blue', 'top', 'Rumble', 'Rumble', 'Robo', 17, 3, 2, 8, 245, 13200, [3157, 3116, 3020, 3089, 3135, 0, 3340]),
    makePlayer(2, 'blue', 'jng', 'Lee Sin', 'LeeSin', 'Croc', 16, 5, 1, 10, 178, 12800, [6693, 3071, 3111, 3047, 0, 0, 3364]),
    makePlayer(3, 'blue', 'mid', 'Azir', 'Azir', 'tinowns', 18, 6, 2, 7, 312, 15600, [3115, 3089, 3157, 3020, 3135, 0, 3340]),
    makePlayer(4, 'blue', 'bot', 'Jinx', 'Jinx', 'Brance', 17, 4, 2, 9, 298, 14800, [3031, 3094, 3085, 3036, 3006, 0, 3340]),
    makePlayer(5, 'blue', 'sup', 'Thresh', 'Thresh', 'Csjr', 14, 0, 2, 14, 42, 8200, [3190, 3109, 3860, 3047, 0, 0, 3364]),
  ],
  red: [
    makePlayer(6, 'red', 'top', 'Aatrox', 'Aatrox', 'Guigo', 16, 3, 4, 3, 238, 11600, [6630, 3071, 3111, 3053, 3047, 0, 3340]),
    makePlayer(7, 'red', 'jng', 'Viego', 'Viego', 'Aegis', 15, 2, 3, 4, 165, 10400, [6672, 3071, 3047, 3111, 0, 0, 3364]),
    makePlayer(8, 'red', 'mid', 'Orianna', 'Orianna', 'Grevthar', 16, 1, 4, 5, 285, 12200, [3115, 3089, 3020, 3157, 0, 0, 3340]),
    makePlayer(9, 'red', 'bot', "Kai'Sa", 'Kaisa', 'Trigo', 16, 3, 3, 3, 274, 12800, [6672, 3094, 3085, 3006, 3036, 0, 3340]),
    makePlayer(10, 'red', 'sup', 'Nautilus', 'Nautilus', 'Jojo', 13, 0, 4, 6, 34, 7400, [3190, 3109, 3860, 3047, 0, 0, 3364]),
  ],
};

// --- Game 2 Draft: RED (Blue) vs LOUD (Red) — RED wins (sides swapped) ---
const GAME2_DRAFT: LiveGameDraft = {
  blue_top: "K'Sante",
  blue_jng: 'Sejuani',
  blue_mid: 'Syndra',
  blue_bot: 'Varus',
  blue_sup: 'Rakan',
  red_top: 'Gnar',
  red_jng: 'Maokai',
  red_mid: 'Corki',
  red_bot: 'Aphelios',
  red_sup: 'Alistar',
};

const GAME2_STATS: SeriesGameStats = {
  blue_kills: 22,
  red_kills: 14,
  blue_gold: 68200,
  red_gold: 57400,
  blue_towers: 10,
  red_towers: 5,
  blue_inhibitors: 3,
  red_inhibitors: 1,
  blue_dragons: 3,
  red_dragons: 2,
  blue_barons: 1,
  red_barons: 1,
};

const GAME2_PLAYERS: SeriesGamePlayers = {
  blue: [
    makePlayer(1, 'blue', 'top', "K'Sante", 'KSante', 'Guigo', 18, 4, 3, 12, 268, 14800, [3078, 3075, 3143, 3047, 3053, 0, 3340]),
    makePlayer(2, 'blue', 'jng', 'Sejuani', 'Sejuani', 'Aegis', 16, 2, 2, 15, 155, 11200, [3068, 3075, 3143, 3047, 0, 0, 3364]),
    makePlayer(3, 'blue', 'mid', 'Syndra', 'Syndra', 'Grevthar', 18, 8, 3, 8, 320, 16400, [3115, 3089, 3020, 3157, 3135, 0, 3340]),
    makePlayer(4, 'blue', 'bot', 'Varus', 'Varus', 'Trigo', 17, 7, 3, 9, 305, 15200, [6672, 3094, 3085, 3036, 3006, 0, 3340]),
    makePlayer(5, 'blue', 'sup', 'Rakan', 'Rakan', 'Jojo', 15, 1, 3, 16, 38, 8800, [3190, 3109, 3860, 3047, 0, 0, 3364]),
  ],
  red: [
    makePlayer(6, 'red', 'top', 'Gnar', 'Gnar', 'Robo', 17, 2, 5, 7, 252, 12400, [3078, 3071, 3053, 3047, 0, 0, 3340]),
    makePlayer(7, 'red', 'jng', 'Maokai', 'Maokai', 'Croc', 15, 1, 4, 9, 148, 9800, [3068, 3075, 3143, 3047, 0, 0, 3364]),
    makePlayer(8, 'red', 'mid', 'Corki', 'Corki', 'tinowns', 17, 5, 4, 5, 290, 14200, [3078, 3508, 3089, 3020, 3031, 0, 3340]),
    makePlayer(9, 'red', 'bot', 'Aphelios', 'Aphelios', 'Brance', 17, 5, 4, 6, 288, 14000, [3031, 3094, 3085, 3036, 3006, 0, 3340]),
    makePlayer(10, 'red', 'sup', 'Alistar', 'Alistar', 'Csjr', 14, 1, 5, 10, 30, 7600, [3190, 3109, 3860, 3047, 0, 0, 3364]),
  ],
};

// --- Game 3 Draft: LOUD (Blue) vs RED (Red) — In Progress ---
const GAME3_DRAFT: LiveGameDraft = {
  blue_top: 'Ambessa',
  blue_jng: 'Jarvan IV',
  blue_mid: 'LeBlanc',
  blue_bot: 'Ezreal',
  blue_sup: 'Braum',
  red_top: 'Camille',
  red_jng: 'Elise',
  red_mid: 'Ahri',
  red_bot: 'Caitlyn',
  red_sup: 'Lulu',
};

// --- Series Games ---
const SERIES_GAMES: SeriesGame[] = [
  {
    number: 1,
    game_id: 'mock-g1',
    state: 'completed',
    is_current: false,
    blue_team: { code: 'LLL', name: 'LOUD', image: LOUD_TEAM.image },
    red_team: { code: 'RED', name: 'RED Canids', image: RED_TEAM.image },
    draft: GAME1_DRAFT,
    final_stats: GAME1_STATS,
    players: GAME1_PLAYERS,
  },
  {
    number: 2,
    game_id: 'mock-g2',
    state: 'completed',
    is_current: false,
    blue_team: { code: 'RED', name: 'RED Canids', image: RED_TEAM.image },
    red_team: { code: 'LLL', name: 'LOUD', image: LOUD_TEAM.image },
    draft: GAME2_DRAFT,
    final_stats: GAME2_STATS,
    players: GAME2_PLAYERS,
  },
  {
    number: 3,
    game_id: 'mock-g3',
    state: 'inProgress',
    is_current: true,
    blue_team: { code: 'LLL', name: 'LOUD', image: LOUD_TEAM.image },
    red_team: { code: 'RED', name: 'RED Canids', image: RED_TEAM.image },
    draft: GAME3_DRAFT,
    final_stats: null,
    players: null,
  },
];

// --- Prediction ---
const MOCK_PREDICTION: LiveGamePrediction = {
  predictions: {
    blue_win_prob: 54.2,
    red_win_prob: 45.8,
    total_kills: 26,
    total_towers: 14,
    total_dragons: 6,
    total_barons: 2,
    kills_range: [18, 34],
    towers_range: [10, 18],
    dragons_range: [4, 8],
    barons_range: [1, 3],
  },
  composition: {
    blue: {
      early_game: 0.6, scaling: 0.3, teamfight: 0.5, splitpush: 0.4,
      poke: 0.3, engage: 0.7, pick: 0.5, siege: 0.2, ap_count: 2, ad_count: 3,
    },
    red: {
      early_game: 0.5, scaling: 0.6, teamfight: 0.4, splitpush: 0.5,
      poke: 0.5, engage: 0.3, pick: 0.6, siege: 0.3, ap_count: 2, ad_count: 3,
    },
  } as CompositionAnalysis,
  features_available: true,
  models_loaded: true,
  teams_provided: true,
};

// --- Lane Matchups ---
const MOCK_LANE_MATCHUPS: LaneMatchup[] = [
  {
    position: 'top',
    blue_champion: 'Ambessa',
    red_champion: 'Camille',
    blue_win_rate: 53.2,
    red_win_rate: 46.8,
    blue_wins: 8,
    red_wins: 7,
    games: 15,
    blue_player_stats: { player_name: 'Robo', games: 12, wins: 7, win_rate: 58.3 },
    red_player_stats: { player_name: 'Guigo', games: 9, wins: 5, win_rate: 55.6 },
  },
  {
    position: 'jng',
    blue_champion: 'Jarvan IV',
    red_champion: 'Elise',
    blue_win_rate: 48.5,
    red_win_rate: 51.5,
    blue_wins: 16,
    red_wins: 17,
    games: 33,
    blue_player_stats: { player_name: 'Croc', games: 15, wins: 9, win_rate: 60.0 },
    red_player_stats: { player_name: 'Aegis', games: 18, wins: 10, win_rate: 55.6 },
  },
  {
    position: 'mid',
    blue_champion: 'LeBlanc',
    red_champion: 'Ahri',
    blue_win_rate: 51.8,
    red_win_rate: 48.2,
    blue_wins: 29,
    red_wins: 27,
    games: 56,
    blue_player_stats: { player_name: 'tinowns', games: 22, wins: 14, win_rate: 63.6 },
    red_player_stats: { player_name: 'Grevthar', games: 20, wins: 11, win_rate: 55.0 },
  },
  {
    position: 'bot',
    blue_champion: 'Ezreal',
    red_champion: 'Caitlyn',
    blue_win_rate: 49.1,
    red_win_rate: 50.9,
    blue_wins: 54,
    red_wins: 56,
    games: 110,
    blue_player_stats: { player_name: 'Brance', games: 30, wins: 16, win_rate: 53.3 },
    red_player_stats: { player_name: 'Trigo', games: 25, wins: 14, win_rate: 56.0 },
  },
  {
    position: 'sup',
    blue_champion: 'Braum',
    red_champion: 'Lulu',
    blue_win_rate: 50.5,
    red_win_rate: 49.5,
    blue_wins: 50,
    red_wins: 49,
    games: 99,
    blue_player_stats: { player_name: 'Csjr', games: 8, wins: 5, win_rate: 62.5 },
    red_player_stats: { player_name: 'Jojo', games: 14, wins: 8, win_rate: 57.1 },
  },
];

// --- Synergies ---
const MOCK_SYNERGIES = {
  blue: [
    { champion1: 'LeBlanc', position1: 'mid', champion2: 'Jarvan IV', position2: 'jng', games: 18, wins: 11, win_rate: 61.1 },
    { champion1: 'Ezreal', position1: 'bot', champion2: 'Braum', position2: 'sup', games: 22, wins: 13, win_rate: 59.1 },
  ] as SynergyPair[],
  red: [
    { champion1: 'Ahri', position1: 'mid', champion2: 'Elise', position2: 'jng', games: 14, wins: 8, win_rate: 57.1 },
    { champion1: 'Caitlyn', position1: 'bot', champion2: 'Lulu', position2: 'sup', games: 28, wins: 17, win_rate: 60.7 },
  ] as SynergyPair[],
};

// --- Team Context ---
const MOCK_TEAM_CONTEXT: TeamContext = {
  blue_team: {
    elo: { global: 1620, blue: 1640, red: 1595 },
    stats: {
      win_rate: 68.0,
      avg_kills: 14.2,
      avg_deaths: 10.5,
      avg_towers: 7.8,
      avg_dragons: 3.4,
      avg_barons: 1.2,
      first_blood_rate: 58.0,
      first_tower_rate: 62.0,
      avg_golddiffat15: 1250,
      avg_game_length: 31.5,
      win_rate_last3: 66.7,
      win_rate_last5: 80.0,
      streak: 2,
      blue_win_rate: 72.0,
      red_win_rate: 63.0,
    },
    recent_matches: [
      { date: '2026-02-19', opponent_code: 'PNG', opponent_image: null, side: 'Blue', won: true },
      { date: '2026-02-17', opponent_code: 'FUR', opponent_image: null, side: 'Red', won: true },
      { date: '2026-02-15', opponent_code: 'ITZ', opponent_image: null, side: 'Blue', won: false },
      { date: '2026-02-13', opponent_code: 'FLA', opponent_image: null, side: 'Blue', won: true },
      { date: '2026-02-11', opponent_code: 'KBM', opponent_image: null, side: 'Red', won: true },
    ],
  },
  red_team: {
    elo: { global: 1555, blue: 1570, red: 1540 },
    stats: {
      win_rate: 55.0,
      avg_kills: 12.8,
      avg_deaths: 12.2,
      avg_towers: 6.5,
      avg_dragons: 3.0,
      avg_barons: 0.9,
      first_blood_rate: 48.0,
      first_tower_rate: 45.0,
      avg_golddiffat15: -320,
      avg_game_length: 33.2,
      win_rate_last3: 66.7,
      win_rate_last5: 60.0,
      streak: 1,
      blue_win_rate: 60.0,
      red_win_rate: 50.0,
    },
    recent_matches: [
      { date: '2026-02-19', opponent_code: 'FLA', opponent_image: null, side: 'Red', won: true },
      { date: '2026-02-17', opponent_code: 'PNG', opponent_image: null, side: 'Blue', won: true },
      { date: '2026-02-15', opponent_code: 'LLL', opponent_image: null, side: 'Red', won: false },
      { date: '2026-02-13', opponent_code: 'ITZ', opponent_image: null, side: 'Blue', won: false },
      { date: '2026-02-11', opponent_code: 'FUR', opponent_image: null, side: 'Red', won: true },
    ],
  },
  h2h: {
    total_games: 8,
    blue_win_rate: 62.5,
    red_win_rate: 37.5,
    recent_form_blue: 75.0,
  },
};

// --- Enrichment ---
const MOCK_ENRICHMENT: LiveGameEnrichment = {
  lane_matchups: MOCK_LANE_MATCHUPS,
  synergies: MOCK_SYNERGIES,
  champion_stats: {
    'blue_top': { win_rate: 54.0, avg_kda: 3.2, avg_kills: 4.1, avg_deaths: 3.0, avg_gold_per_min: 420, avg_damage_per_min: 580, avg_cs_per_min: 8.2, games_played: 45 },
    'blue_jng': { win_rate: 51.0, avg_kda: 3.8, avg_kills: 3.5, avg_deaths: 3.2, avg_gold_per_min: 380, avg_damage_per_min: 420, avg_cs_per_min: 5.8, games_played: 62 },
    'blue_mid': { win_rate: 52.5, avg_kda: 3.5, avg_kills: 5.8, avg_deaths: 3.5, avg_gold_per_min: 440, avg_damage_per_min: 650, avg_cs_per_min: 9.1, games_played: 88 },
    'blue_bot': { win_rate: 49.8, avg_kda: 4.1, avg_kills: 4.8, avg_deaths: 2.8, avg_gold_per_min: 450, avg_damage_per_min: 620, avg_cs_per_min: 9.5, games_played: 120 },
    'blue_sup': { win_rate: 51.2, avg_kda: 4.5, avg_kills: 0.8, avg_deaths: 3.2, avg_gold_per_min: 280, avg_damage_per_min: 120, avg_cs_per_min: 1.2, games_played: 55 },
    'red_top': { win_rate: 50.5, avg_kda: 3.0, avg_kills: 3.8, avg_deaths: 3.5, avg_gold_per_min: 410, avg_damage_per_min: 560, avg_cs_per_min: 8.0, games_played: 72 },
    'red_jng': { win_rate: 52.0, avg_kda: 3.6, avg_kills: 3.2, avg_deaths: 3.0, avg_gold_per_min: 370, avg_damage_per_min: 400, avg_cs_per_min: 5.5, games_played: 58 },
    'red_mid': { win_rate: 53.2, avg_kda: 3.8, avg_kills: 5.2, avg_deaths: 3.2, avg_gold_per_min: 430, avg_damage_per_min: 640, avg_cs_per_min: 8.8, games_played: 95 },
    'red_bot': { win_rate: 50.8, avg_kda: 4.3, avg_kills: 5.0, avg_deaths: 2.6, avg_gold_per_min: 460, avg_damage_per_min: 640, avg_cs_per_min: 9.8, games_played: 85 },
    'red_sup': { win_rate: 52.5, avg_kda: 5.0, avg_kills: 0.5, avg_deaths: 2.8, avg_gold_per_min: 270, avg_damage_per_min: 100, avg_cs_per_min: 1.0, games_played: 68 },
  },
  team_context: MOCK_TEAM_CONTEXT,
  match_prediction: {
    blue_win_prob: 56.8,
    red_win_prob: 43.2,
    total_kills: 25,
    total_towers: 14,
    total_dragons: 6,
    total_barons: 2,
    game_time: 32.5,
    kills_range: [17, 33],
    towers_range: [10, 18],
    dragons_range: [4, 8],
    barons_range: [1, 3],
    game_time_range: [26, 39],
    features_available: true,
    models_loaded: true,
  },
};

// --- Full LiveGame Mock ---
const MOCK_GAME: LiveGame = {
  match_id: 'mock-loud-vs-red-bo3',
  game_id: 'mock-g3',
  start_time: new Date().toISOString(),
  league: { name: 'CBLOL', slug: 'cblol', image: 'https://am-a.akamaihd.net/image?resize=72:&f=http%3A%2F%2Fstatic.lolesports.com%2Fleagues%2Fcblol-new-logo.png' },
  block_name: 'Playoffs — Semifinal',
  strategy: { type: 'bestOf', count: 3 },
  stats_enabled: true,
  patch_version: '15.3',
  ddragon_version: DDRAGON,
  blue_team: LOUD_TEAM,
  red_team: RED_TEAM,
  draft: GAME3_DRAFT,
  live_stats: null,
  players: null,
  prediction: MOCK_PREDICTION,
  enrichment: MOCK_ENRICHMENT,
  series_games: SERIES_GAMES,
};

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function MockLiveTestPage() {
  const game = MOCK_GAME;
  const preds = game.prediction?.predictions ?? null;

  const hasSeries = game.series_games && game.series_games.length > 1;
  const hasLaneMatchups = game.enrichment?.lane_matchups && game.enrichment.lane_matchups.length > 0;
  const hasPlayerChampionHistory = game.enrichment?.lane_matchups?.some(
    mu => mu.blue_player_stats || mu.red_player_stats
  );
  const hasSynergies = game.enrichment?.synergies &&
    (game.enrichment.synergies.blue.length > 0 || game.enrichment.synergies.red.length > 0);
  const hasTeamContext = !!game.enrichment?.team_context;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/settings"
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ChevronLeft size={14} />
            Configuracoes
          </Link>
          <div className="h-4 w-px bg-zinc-800" />
          <FlaskConical size={16} className="text-amber-400" />
          <span className="text-sm font-semibold text-amber-400">MOCK TEST</span>
          <div className="h-4 w-px bg-zinc-800" />
          <span className="text-sm font-medium text-zinc-400">CBLOL</span>
          <span className="text-sm text-zinc-600">Playoffs — Semifinal</span>
          <span className="text-sm text-zinc-600">Bo3</span>
        </div>
        <div className="px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <span className="text-[10px] font-bold text-amber-400 uppercase">Dados Mockados — Verificacao</span>
        </div>
      </div>

      {/* Series Header */}
      {hasSeries && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-6 py-5">
          <div className="flex items-center justify-center gap-8">
            <div className="flex items-center gap-4">
              {game.blue_team.image && (
                <img src={game.blue_team.image} alt={game.blue_team.code} className="h-12 w-12 object-contain" />
              )}
              <span className="text-lg font-bold text-blue-400">{game.blue_team.code}</span>
            </div>
            <div className="flex items-center gap-4 px-6">
              <span className="text-4xl font-black tabular-nums text-blue-400">
                {game.blue_team.result?.gameWins ?? 0}
              </span>
              <div className="flex flex-col items-center">
                <span className="text-zinc-600 font-bold text-lg">:</span>
                <span className="text-[10px] text-zinc-600">Bo3</span>
              </div>
              <span className="text-4xl font-black tabular-nums text-red-400">
                {game.red_team.result?.gameWins ?? 0}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-lg font-bold text-red-400">{game.red_team.code}</span>
              {game.red_team.image && (
                <img src={game.red_team.image} alt={game.red_team.code} className="h-12 w-12 object-contain" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Match Prediction Panel */}
      {game.draft && (
        <MatchPredictionPanel
          draft={game.draft}
          predictions={preds}
          predictionMessage={game.prediction?.message}
          matchPrediction={game.enrichment?.match_prediction}
          teamContext={game.enrichment?.team_context}
          composition={game.prediction?.composition}
          blueTeam={game.blue_team}
          redTeam={game.red_team}
          ddragonVersion={game.ddragon_version}
        />
      )}

      {/* Series Analysis Panel */}
      {hasSeries && (
        <SeriesAnalysisPanel
          game={game}
          ddragonVersion={game.ddragon_version}
        />
      )}

      {/* Analytics Enrichment */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="flex flex-col gap-4">
          {hasLaneMatchups && (
            <LaneMatchupsPanel matchups={game.enrichment!.lane_matchups!} />
          )}
          {hasPlayerChampionHistory && (
            <PlayerChampionHistoryPanel matchups={game.enrichment!.lane_matchups!} />
          )}
          {hasSynergies && (
            <SynergiesPanel synergies={game.enrichment!.synergies!} />
          )}
        </div>
        {hasTeamContext && (
          <TeamContextPanel
            context={game.enrichment!.team_context!}
            blueTeamCode={game.blue_team.code}
            redTeamCode={game.red_team.code}
          />
        )}
      </div>

      {/* Data Summary */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <p className="text-xs font-semibold text-zinc-400 mb-3">Dados Mockados Incluidos</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
          {[
            { label: 'Serie', value: `Bo3 — ${SERIES_GAMES.filter(s => s.state === 'completed').length} completos` },
            { label: 'Drafts', value: `${SERIES_GAMES.filter(s => s.draft).length} jogos com draft` },
            { label: 'Final Stats', value: `${SERIES_GAMES.filter(s => s.final_stats).length} jogos com stats` },
            { label: 'Players', value: `${SERIES_GAMES.filter(s => s.players).length} jogos com players` },
            { label: 'Lane Matchups', value: `${MOCK_LANE_MATCHUPS.length} matchups` },
            { label: 'Synergies', value: `${MOCK_SYNERGIES.blue.length + MOCK_SYNERGIES.red.length} pares` },
            { label: 'Team Context', value: 'ELO + Stats + H2H + Recent' },
            { label: 'Predictions', value: 'Draft + Team + Composition' },
            { label: 'Champion Stats', value: `${Object.keys(MOCK_ENRICHMENT.champion_stats ?? {}).length} slots` },
            { label: 'Fearless Picks', value: `${new Set([...Object.values(GAME1_DRAFT), ...Object.values(GAME2_DRAFT), ...Object.values(GAME3_DRAFT)].filter(Boolean)).size} unicos` },
            { label: 'Match Prediction', value: `${MOCK_ENRICHMENT.match_prediction?.blue_win_prob}% vs ${MOCK_ENRICHMENT.match_prediction?.red_win_prob}%` },
            { label: 'Game Time Est.', value: `${MOCK_ENRICHMENT.match_prediction?.game_time} min` },
          ].map(item => (
            <div key={item.label} className="bg-zinc-800/50 rounded px-2 py-1.5">
              <p className="text-zinc-500">{item.label}</p>
              <p className="text-zinc-300 font-bold">{item.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
