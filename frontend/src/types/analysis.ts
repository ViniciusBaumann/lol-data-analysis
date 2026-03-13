export interface FearlessChampionEntry {
  champion: string;
  position: string;
  /** Which team picked (by team code, not side color) */
  teamCode: string;
  side: 'blue' | 'red';
  gameNumber: number;
  isCurrentGame: boolean;
}

export interface ObjectiveSideStat {
  blue: number;
  red: number;
  diff: number;
}

export interface GameObjectiveDiff {
  gameNumber: number;
  winner: 'blue' | 'red' | null;
  blueSide: string;
  redSide: string;
  kills: ObjectiveSideStat;
  towers: ObjectiveSideStat;
  dragons: ObjectiveSideStat;
  barons: ObjectiveSideStat;
  gold: ObjectiveSideStat;
  inhibitors: ObjectiveSideStat;
}

export interface SeriesObjectiveTotals {
  gamesPlayed: number;
  kills: ObjectiveSideStat;
  towers: ObjectiveSideStat;
  dragons: ObjectiveSideStat;
  barons: ObjectiveSideStat;
  gold: ObjectiveSideStat;
}

export interface TeamObjectivePerformance {
  teamCode: string;
  metric: string;
  seriesAvg: number;
  seasonAvg: number;
  delta: number;
  deltaPercent: number;
}

export interface SeriesMomentum {
  blueWins: number;
  redWins: number;
  momentumTrail: { gameNumber: number; winner: 'blue' | 'red'; teamCode: string }[];
  lastWinner: 'blue' | 'red' | null;
  lastWinnerCode: string | null;
  currentStreak: number;
  momentumScore: number;
}

export interface ChampionPoolMetric {
  teamCode: string;
  /** 0 (no constraint) to 100 (critical) */
  constraintIndex: number;
  uniquePicksUsed: number;
  totalMetaPicks: number;
  metaPicksRemaining: number;
  estimatedPenalty: number;
  usedByPosition: Record<string, string[]>;
  constrainedPositions: string[];
  highPriorityAvailable: { champion: string; position: string }[];
}

export interface PredictionAdjustment {
  label: string;
  value: number;
  description: string;
}

export interface SeriesAdjustedPrediction {
  baseBlueProbability: number;
  adjustedBlueProbability: number;
  adjustments: PredictionAdjustment[];
}

export interface SeriesSideTracker {
  gamesSides: { gameNumber: number; blueTeamCode: string; redTeamCode: string }[];
  nextBlueTeamCode: string | null;
  blueSideWinRate: number;
}

/** Single objective forecast for the next map */
export interface ObjectiveForecastEntry {
  key: string;
  label: string;
  /** Base predicted value (from model or season avg) */
  basePredicted: number;
  /** Adjusted value using series trend */
  adjusted: number;
  /** Range [low, high] */
  range: [number, number];
  /** Trend from series: positive = increasing, negative = decreasing */
  seriesTrend: number;
  /** Series average so far */
  seriesAvg: number;
  /** Season average */
  seasonAvg: number;
  /** Which team favored: 'blue' | 'red' | 'even' */
  favored: 'blue' | 'red' | 'even';
  /** Blue team expected share of this objective */
  blueExpected: number;
  /** Red team expected share */
  redExpected: number;
}

/** Game time forecast for the next map */
export interface GameTimeForecast {
  /** Predicted game time in minutes */
  predicted: number;
  /** Range [low, high] in minutes */
  range: [number, number];
  /** Average game time across completed series games (in minutes) */
  seriesAvg: number | null;
  /** Trend: positive = games getting longer, negative = shorter */
  seriesTrend: number;
}

/** Full objective forecast for the next map */
export interface ObjectiveForecast {
  gameNumber: number;
  entries: ObjectiveForecastEntry[];
  gameTime: GameTimeForecast | null;
}

export interface SeriesAnalysisResult {
  hasData: boolean;
  fearlessTracker: {
    picks: FearlessChampionEntry[];
    allUsedChampions: Set<string>;
    gamesCompleted: number;
    totalUsed: number;
  };
  objectiveDiffs: GameObjectiveDiff[];
  seriesTotals: SeriesObjectiveTotals;
  bluePerformance: TeamObjectivePerformance[];
  redPerformance: TeamObjectivePerformance[];
  momentum: SeriesMomentum;
  adjustedPrediction: SeriesAdjustedPrediction | null;
  objectiveForecast: ObjectiveForecast | null;
  bluePool: ChampionPoolMetric;
  redPool: ChampionPoolMetric;
  sideTracker: SeriesSideTracker;
}
