import { useMemo } from 'react';
import type {
  LiveGame,
  SeriesGame,
  SeriesAnalysisResult,
  FearlessChampionEntry,
  GameObjectiveDiff,
  SeriesObjectiveTotals,
  ObjectiveSideStat,
  TeamObjectivePerformance,
  SeriesMomentum,
  SeriesAdjustedPrediction,
  PredictionAdjustment,
  ChampionPoolMetric,
  SeriesSideTracker,
  TeamContextStats,
  ObjectiveForecast,
  ObjectiveForecastEntry,
} from '@/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POSITIONS = ['top', 'jng', 'mid', 'bot', 'sup'] as const;

/** Recalibrated weights from data analyst review */
const WEIGHTS = {
  MOMENTUM_PER_GAME: 0.65,
  MOMENTUM_CAP: 4,
  DRAGON_TREND: 1.8,
  TOWER_TREND: 1.0,
  SIDE_FACTOR: 1.0,
  POOL_MAX_PENALTY: 2.5,
  POOL_EXPONENT: 1.5,
  TOTAL_CAP: 5,
} as const;

/** High-priority meta champions per position (2025 meta) */
const META_PICKS: Record<string, string[]> = {
  top: ['Aatrox', "K'Sante", 'Jax', 'Rumble', 'Gnar', 'Renekton', 'Ambessa', 'Gragas', 'Camille', 'Aurora'],
  jng: ['Lee Sin', 'Viego', 'Sejuani', 'Maokai', 'Vi', 'Jarvan IV', 'Rek\'Sai', 'Elise', 'Nidalee', 'Xin Zhao'],
  mid: ['Azir', 'Orianna', 'Ahri', 'Syndra', 'Corki', 'LeBlanc', 'Aurora', 'Tristana', 'Sylas', 'Taliyah'],
  bot: ['Jinx', "Kai'Sa", 'Varus', 'Aphelios', 'Ezreal', 'Caitlyn', 'Ashe', 'Kalista', 'Zeri', 'Jhin'],
  sup: ['Nautilus', 'Thresh', 'Rakan', 'Alistar', 'Leona', 'Lulu', 'Renata Glasc', 'Braum', 'Rell', 'Poppy'],
};

const TOTAL_META_PICKS = Object.values(META_PICKS).reduce((sum, arr) => sum + arr.length, 0);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStat(blue: number, red: number): ObjectiveSideStat {
  return { blue, red, diff: blue - red };
}

function addStat(a: ObjectiveSideStat, b: ObjectiveSideStat): ObjectiveSideStat {
  return { blue: a.blue + b.blue, red: a.red + b.red, diff: a.diff + b.diff };
}

const ZERO_STAT: ObjectiveSideStat = { blue: 0, red: 0, diff: 0 };

function getCompletedGames(series: SeriesGame[] | null): SeriesGame[] {
  return (series ?? [])
    .filter(sg => sg.state === 'completed')
    .sort((a, b) => a.number - b.number);
}

function getCurrentGameNumber(series: SeriesGame[] | null): number {
  const current = (series ?? []).find(sg => sg.is_current);
  return current?.number ?? ((series ?? []).length + 1);
}

/** Determine winner from final_stats — uses explicit winner field (PandaScore) or heuristic */
function getGameWinner(sg: SeriesGame): 'blue' | 'red' | null {
  if (!sg.final_stats) return null;
  const s = sg.final_stats;
  // 1) Explicit winner field (from PandaScore)
  if (s.winner) {
    if (s.winner.toUpperCase() === sg.blue_team.code.toUpperCase()) return 'blue';
    if (s.winner.toUpperCase() === sg.red_team.code.toUpperCase()) return 'red';
  }
  // 2) Gold is the most reliable indicator of who won
  if (s.blue_gold !== s.red_gold) return s.blue_gold > s.red_gold ? 'blue' : 'red';
  // 3) Fallback to kills
  if (s.blue_kills !== s.red_kills) return s.blue_kills > s.red_kills ? 'blue' : 'red';
  return null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSeriesAnalysis(game: LiveGame): SeriesAnalysisResult {
  const series = game.series_games;
  const mainBlueCode = game.blue_team.code;
  const mainRedCode = game.red_team.code;

  // Log data availability on first render
  useMemo(() => {
    if (!series || series.length <= 1) {
      console.warn('[useSeriesAnalysis] Sem dados de serie (series_games ausente ou <= 1)');
      return;
    }
    const completed = series.filter(sg => sg.state === 'completed');
    const withStats = completed.filter(sg => sg.final_stats);
    const withDraft = completed.filter(sg => sg.draft);
    const withPlayers = completed.filter(sg => sg.players);

    console.log(
      `[useSeriesAnalysis] ${mainBlueCode} vs ${mainRedCode}: ` +
      `${completed.length} completados, ` +
      `${withStats.length} com stats, ` +
      `${withDraft.length} com draft, ` +
      `${withPlayers.length} com players`
    );

    for (const sg of completed) {
      if (!sg.final_stats) console.warn(`[useSeriesAnalysis] G${sg.number}: final_stats NULO — sem dados de snapshot`);
      if (!sg.draft) console.warn(`[useSeriesAnalysis] G${sg.number}: draft NULO — fearless tracker incompleto`);
    }

    if (!game.prediction) console.warn('[useSeriesAnalysis] prediction NULO — adjusted prediction indisponivel');
    if (!game.enrichment?.team_context) console.warn('[useSeriesAnalysis] team_context NULO — performance vs season indisponivel');
  }, [series, mainBlueCode, mainRedCode, game.prediction, game.enrichment?.team_context]);

  // -----------------------------------------------------------------------
  // 1. Fearless Draft Tracker
  // -----------------------------------------------------------------------
  const fearlessTracker = useMemo(() => {
    const completed = getCompletedGames(series);
    const currentNum = getCurrentGameNumber(series);
    const picks: FearlessChampionEntry[] = [];
    const allUsedChampions = new Set<string>();

    for (const sg of completed) {
      if (!sg.draft) continue;
      for (const pos of POSITIONS) {
        const blueChamp = sg.draft[`blue_${pos}`] as string;
        const redChamp = sg.draft[`red_${pos}`] as string;
        if (blueChamp) {
          picks.push({
            champion: blueChamp,
            position: pos,
            teamCode: sg.blue_team.code,
            side: 'blue',
            gameNumber: sg.number,
            isCurrentGame: false,
          });
          allUsedChampions.add(blueChamp);
        }
        if (redChamp) {
          picks.push({
            champion: redChamp,
            position: pos,
            teamCode: sg.red_team.code,
            side: 'red',
            gameNumber: sg.number,
            isCurrentGame: false,
          });
          allUsedChampions.add(redChamp);
        }
      }
    }

    // Current game draft (in progress)
    if (game.draft) {
      const currentSg = (series ?? []).find(sg => sg.is_current);
      const blueCode = currentSg?.blue_team.code ?? mainBlueCode;
      const redCode = currentSg?.red_team.code ?? mainRedCode;

      for (const pos of POSITIONS) {
        const blueChamp = game.draft[`blue_${pos}`] as string;
        const redChamp = game.draft[`red_${pos}`] as string;
        if (blueChamp) {
          picks.push({
            champion: blueChamp,
            position: pos,
            teamCode: blueCode,
            side: 'blue',
            gameNumber: currentNum,
            isCurrentGame: true,
          });
          allUsedChampions.add(blueChamp);
        }
        if (redChamp) {
          picks.push({
            champion: redChamp,
            position: pos,
            teamCode: redCode,
            side: 'red',
            gameNumber: currentNum,
            isCurrentGame: true,
          });
          allUsedChampions.add(redChamp);
        }
      }
    }

    return {
      picks,
      allUsedChampions,
      gamesCompleted: completed.length,
      totalUsed: allUsedChampions.size,
    };
  }, [series, game.draft, mainBlueCode, mainRedCode]);

  // -----------------------------------------------------------------------
  // 2. Side Tracker
  // -----------------------------------------------------------------------
  const sideTracker = useMemo((): SeriesSideTracker => {
    const completed = getCompletedGames(series);
    const gamesSides = completed.map(sg => ({
      gameNumber: sg.number,
      blueTeamCode: sg.blue_team.code,
      redTeamCode: sg.red_team.code,
    }));

    // Determine next game side (teams alternate)
    let nextBlueTeamCode: string | null = null;
    if (gamesSides.length > 0) {
      const lastGame = gamesSides[gamesSides.length - 1];
      // Next game: the team that was red last becomes blue
      nextBlueTeamCode = lastGame.redTeamCode;
    }

    // Blue side win rate in this series
    let blueSideWins = 0;
    for (const sg of completed) {
      const winner = getGameWinner(sg);
      if (winner === 'blue') blueSideWins++;
    }
    const blueSideWinRate = completed.length > 0 ? (blueSideWins / completed.length) * 100 : 50;

    return { gamesSides, nextBlueTeamCode, blueSideWinRate };
  }, [series]);

  // -----------------------------------------------------------------------
  // 3. Objective Differentials Per Map
  // -----------------------------------------------------------------------
  const { objectiveDiffs, seriesTotals } = useMemo(() => {
    const completed = getCompletedGames(series);

    const diffs: GameObjectiveDiff[] = completed
      .filter(sg => sg.final_stats)
      .map(sg => {
        const s = sg.final_stats!;
        return {
          gameNumber: sg.number,
          winner: getGameWinner(sg),
          blueSide: sg.blue_team.code,
          redSide: sg.red_team.code,
          kills: makeStat(s.blue_kills, s.red_kills),
          towers: makeStat(s.blue_towers, s.red_towers),
          dragons: makeStat(s.blue_dragons, s.red_dragons),
          barons: makeStat(s.blue_barons, s.red_barons),
          gold: makeStat(s.blue_gold, s.red_gold),
          inhibitors: makeStat(s.blue_inhibitors, s.red_inhibitors),
        };
      });

    const totals: SeriesObjectiveTotals = {
      gamesPlayed: diffs.length,
      kills: { ...ZERO_STAT },
      towers: { ...ZERO_STAT },
      dragons: { ...ZERO_STAT },
      barons: { ...ZERO_STAT },
      gold: { ...ZERO_STAT },
    };

    for (const d of diffs) {
      totals.kills = addStat(totals.kills, d.kills);
      totals.towers = addStat(totals.towers, d.towers);
      totals.dragons = addStat(totals.dragons, d.dragons);
      totals.barons = addStat(totals.barons, d.barons);
      totals.gold = addStat(totals.gold, d.gold);
    }

    return { objectiveDiffs: diffs, seriesTotals: totals };
  }, [series]);

  // -----------------------------------------------------------------------
  // 4. Team Performance vs Season Average
  // -----------------------------------------------------------------------
  const { bluePerformance, redPerformance } = useMemo(() => {
    const n = seriesTotals.gamesPlayed;
    const tc = game.enrichment?.team_context;
    if (!n || !tc) return { bluePerformance: [], redPerformance: [] };

    const buildPerf = (
      teamCode: string,
      stats: TeamContextStats | null,
      side: 'blue' | 'red',
    ): TeamObjectivePerformance[] => {
      if (!stats) return [];
      const metrics: { metric: string; seriesAvg: number; seasonAvg: number }[] = [
        { metric: 'Kills', seriesAvg: seriesTotals.kills[side] / n, seasonAvg: stats.avg_kills },
        { metric: 'Torres', seriesAvg: seriesTotals.towers[side] / n, seasonAvg: stats.avg_towers },
        { metric: 'Dragoes', seriesAvg: seriesTotals.dragons[side] / n, seasonAvg: stats.avg_dragons },
        { metric: 'Baroes', seriesAvg: seriesTotals.barons[side] / n, seasonAvg: stats.avg_barons },
      ];
      return metrics.map(m => ({
        teamCode,
        ...m,
        delta: m.seriesAvg - m.seasonAvg,
        deltaPercent: m.seasonAvg > 0 ? ((m.seriesAvg - m.seasonAvg) / m.seasonAvg) * 100 : 0,
      }));
    };

    return {
      bluePerformance: buildPerf(mainBlueCode, tc.blue_team.stats, 'blue'),
      redPerformance: buildPerf(mainRedCode, tc.red_team.stats, 'red'),
    };
  }, [seriesTotals, game.enrichment?.team_context, mainBlueCode, mainRedCode]);

  // -----------------------------------------------------------------------
  // 5. Momentum
  // -----------------------------------------------------------------------
  const momentum = useMemo((): SeriesMomentum => {
    const completed = getCompletedGames(series);

    let blueWins = 0;
    let redWins = 0;
    const trail: SeriesMomentum['momentumTrail'] = [];
    let lastWinner: 'blue' | 'red' | null = null;
    let lastWinnerCode: string | null = null;
    let currentStreak = 0;

    for (const sg of completed) {
      const winner = getGameWinner(sg);
      if (!winner) continue;

      if (winner === 'blue') blueWins++;
      else redWins++;

      const winnerCode = winner === 'blue' ? sg.blue_team.code : sg.red_team.code;
      trail.push({ gameNumber: sg.number, winner, teamCode: winnerCode });

      if (winnerCode === lastWinnerCode) {
        currentStreak++;
      } else {
        currentStreak = 1;
        lastWinner = winner;
        lastWinnerCode = winnerCode;
      }
    }

    // Weighted momentum score: recent games matter more
    let momentumScore = 0;
    for (let i = 0; i < trail.length; i++) {
      const weight = (i + 1) / trail.length;
      const sign = trail[i].teamCode === mainBlueCode ? 1 : -1;
      momentumScore += sign * weight;
    }

    return { blueWins, redWins, momentumTrail: trail, lastWinner, lastWinnerCode, currentStreak, momentumScore };
  }, [series, mainBlueCode]);

  // -----------------------------------------------------------------------
  // 6. Champion Pool Analysis (constraint_index 0-100)
  // -----------------------------------------------------------------------
  const { bluePool, redPool } = useMemo(() => {
    const allUsed = fearlessTracker.allUsedChampions;

    const buildPool = (teamCode: string): ChampionPoolMetric => {
      const teamPicks = fearlessTracker.picks.filter(
        p => p.teamCode === teamCode && !p.isCurrentGame,
      );

      const usedByPosition: Record<string, string[]> = {};
      for (const pos of POSITIONS) usedByPosition[pos] = [];

      const usedSet = new Set<string>();
      for (const pick of teamPicks) {
        usedByPosition[pick.position]?.push(pick.champion);
        usedSet.add(pick.champion);
      }

      // Count meta picks remaining (not used by EITHER team — fearless is global)
      let metaRemaining = 0;
      const highPriorityAvailable: { champion: string; position: string }[] = [];
      const constrainedPositions: string[] = [];

      for (const pos of POSITIONS) {
        const metaForPos = META_PICKS[pos] ?? [];
        const available = metaForPos.filter(c => !allUsed.has(c));
        metaRemaining += available.length;

        for (const c of available) {
          highPriorityAvailable.push({ champion: c, position: pos });
        }

        // Position is constrained if >70% of its meta picks are gone
        if (metaForPos.length > 0 && available.length <= metaForPos.length * 0.3) {
          constrainedPositions.push(pos);
        }
      }

      // Constraint index: (used/total)^1.5 * 100
      const usedRatio = allUsed.size / TOTAL_META_PICKS;
      const constraintIndex = Math.min(100, Math.pow(usedRatio, WEIGHTS.POOL_EXPONENT) * 100);

      // Estimated penalty: -2.5 * (1 - remaining_ratio)
      const remainingRatio = metaRemaining / TOTAL_META_PICKS;
      const estimatedPenalty = -WEIGHTS.POOL_MAX_PENALTY * (1 - remainingRatio);

      return {
        teamCode,
        constraintIndex: Math.round(constraintIndex),
        uniquePicksUsed: usedSet.size,
        totalMetaPicks: TOTAL_META_PICKS,
        metaPicksRemaining: metaRemaining,
        estimatedPenalty: Math.round(estimatedPenalty * 100) / 100,
        usedByPosition,
        constrainedPositions,
        highPriorityAvailable,
      };
    };

    return {
      bluePool: buildPool(mainBlueCode),
      redPool: buildPool(mainRedCode),
    };
  }, [fearlessTracker, mainBlueCode, mainRedCode]);

  // -----------------------------------------------------------------------
  // 7. Adjusted Prediction (recalibrated weights)
  // -----------------------------------------------------------------------
  const adjustedPrediction = useMemo((): SeriesAdjustedPrediction | null => {
    const basePred = game.prediction?.predictions;
    if (!basePred || !fearlessTracker.gamesCompleted) return null;

    const baseBlue = basePred.blue_win_prob;
    const adjustments: PredictionAdjustment[] = [];

    // A) Momentum adjustment: 0.65% per streak game, capped at 4%
    if (momentum.currentStreak >= 2 && momentum.lastWinnerCode) {
      const isBlueStreak = momentum.lastWinnerCode === mainBlueCode;
      const rawAdj = WEIGHTS.MOMENTUM_PER_GAME * momentum.currentStreak;
      const capped = Math.min(WEIGHTS.MOMENTUM_CAP, rawAdj);
      const value = isBlueStreak ? capped : -capped;
      adjustments.push({
        label: 'Momentum',
        value,
        description: `${momentum.lastWinnerCode} venceu ${momentum.currentStreak} jogos seguidos`,
      });
    }

    // B) Dragon trend: +1.8% if one team dominates dragons (avg diff >= 1)
    if (seriesTotals.gamesPlayed >= 2) {
      const dragonAvgDiff = seriesTotals.dragons.diff / seriesTotals.gamesPlayed;
      if (Math.abs(dragonAvgDiff) >= 1) {
        const value = dragonAvgDiff > 0 ? WEIGHTS.DRAGON_TREND : -WEIGHTS.DRAGON_TREND;
        adjustments.push({
          label: 'Dragoes',
          value,
          description: `${dragonAvgDiff > 0 ? mainBlueCode : mainRedCode} domina dragoes (${dragonAvgDiff > 0 ? '+' : ''}${dragonAvgDiff.toFixed(1)}/jogo)`,
        });
      }

      // C) Tower trend: +1.0%
      const towerAvgDiff = seriesTotals.towers.diff / seriesTotals.gamesPlayed;
      if (Math.abs(towerAvgDiff) >= 1.5) {
        const value = towerAvgDiff > 0 ? WEIGHTS.TOWER_TREND : -WEIGHTS.TOWER_TREND;
        adjustments.push({
          label: 'Torres',
          value,
          description: `${towerAvgDiff > 0 ? mainBlueCode : mainRedCode} domina torres (${towerAvgDiff > 0 ? '+' : ''}${towerAvgDiff.toFixed(1)}/jogo)`,
        });
      }
    }

    // D) Side selection factor: +/-1% based on which side the teams will play
    if (sideTracker.nextBlueTeamCode) {
      const mainTeamIsNextBlue = sideTracker.nextBlueTeamCode === mainBlueCode;
      // Blue side has ~2-3% natural advantage
      const value = mainTeamIsNextBlue ? WEIGHTS.SIDE_FACTOR : -WEIGHTS.SIDE_FACTOR;
      adjustments.push({
        label: 'Lado',
        value,
        description: mainTeamIsNextBlue
          ? `${mainBlueCode} jogara de Blue (vantagem natural)`
          : `${mainBlueCode} jogara de Red`,
      });
    }

    // E) Champion pool constraint differential
    const poolDiffPenalty = bluePool.estimatedPenalty - redPool.estimatedPenalty;
    if (Math.abs(poolDiffPenalty) >= 0.3) {
      const value = poolDiffPenalty;
      const moreConstrained = poolDiffPenalty < 0 ? mainBlueCode : mainRedCode;
      adjustments.push({
        label: 'Pool',
        value: Math.max(-WEIGHTS.POOL_MAX_PENALTY, Math.min(WEIGHTS.POOL_MAX_PENALTY, value)),
        description: `${moreConstrained} mais restrito (idx: ${poolDiffPenalty < 0 ? bluePool.constraintIndex : redPool.constraintIndex}/100)`,
      });
    }

    // Total adjustment capped at +/- 5%
    const totalAdj = adjustments.reduce((sum, a) => sum + a.value, 0);
    const cappedAdj = Math.max(-WEIGHTS.TOTAL_CAP, Math.min(WEIGHTS.TOTAL_CAP, totalAdj));
    const adjusted = Math.max(5, Math.min(95, baseBlue + cappedAdj));

    return {
      baseBlueProbability: baseBlue,
      adjustedBlueProbability: Math.round(adjusted * 10) / 10,
      adjustments,
    };
  }, [
    game.prediction?.predictions,
    fearlessTracker.gamesCompleted,
    momentum,
    seriesTotals,
    sideTracker.nextBlueTeamCode,
    bluePool,
    redPool,
    mainBlueCode,
    mainRedCode,
  ]);

  // -----------------------------------------------------------------------
  // 8. Objective Forecast for Next Map
  // -----------------------------------------------------------------------
  const objectiveForecast = useMemo((): ObjectiveForecast | null => {
    const n = seriesTotals.gamesPlayed;
    if (!n) return null;

    const tc = game.enrichment?.team_context;
    const basePred = game.prediction?.predictions;
    const blueStats = tc?.blue_team.stats;
    const redStats = tc?.red_team.stats;
    const nextGameNum = getCurrentGameNumber(series);

    // Weight: 60% series trend, 40% season average (series data is more recent/relevant)
    const SERIES_WEIGHT = 0.6;
    const SEASON_WEIGHT = 0.4;

    // Momentum multiplier: winning team tends to get slightly more objectives
    const momMultiplier = momentum.lastWinnerCode === mainBlueCode ? 1.03 :
                          momentum.lastWinnerCode === mainRedCode ? 0.97 : 1.0;

    type ObjKey = 'kills' | 'towers' | 'dragons' | 'barons';
    const objectives: {
      key: ObjKey;
      label: string;
      blueSeason: number;
      redSeason: number;
      modelPred: number | null;
      modelRange: [number, number] | undefined;
      stdDev: number;
    }[] = [
      {
        key: 'kills',
        label: 'Kills Totais',
        blueSeason: blueStats?.avg_kills ?? 0,
        redSeason: redStats?.avg_kills ?? 0,
        modelPred: basePred?.total_kills ?? null,
        modelRange: basePred?.kills_range,
        stdDev: 5,
      },
      {
        key: 'towers',
        label: 'Torres Totais',
        blueSeason: blueStats?.avg_towers ?? 0,
        redSeason: redStats?.avg_towers ?? 0,
        modelPred: basePred?.total_towers ?? null,
        modelRange: basePred?.towers_range,
        stdDev: 2,
      },
      {
        key: 'dragons',
        label: 'Dragoes Totais',
        blueSeason: blueStats?.avg_dragons ?? 0,
        redSeason: redStats?.avg_dragons ?? 0,
        modelPred: basePred?.total_dragons ?? null,
        modelRange: basePred?.dragons_range,
        stdDev: 1.2,
      },
      {
        key: 'barons',
        label: 'Baroes Totais',
        blueSeason: blueStats?.avg_barons ?? 0,
        redSeason: redStats?.avg_barons ?? 0,
        modelPred: basePred?.total_barons ?? null,
        modelRange: basePred?.barons_range,
        stdDev: 0.5,
      },
    ];

    const entries: ObjectiveForecastEntry[] = objectives.map(obj => {
      const seriesBlueAvg = seriesTotals[obj.key].blue / n;
      const seriesRedAvg = seriesTotals[obj.key].red / n;
      const seriesTotalAvg = (seriesTotals[obj.key].blue + seriesTotals[obj.key].red) / n;
      const seasonTotalAvg = obj.blueSeason + obj.redSeason;

      // Trend: are objectives increasing or decreasing across games?
      let seriesTrend = 0;
      if (objectiveDiffs.length >= 2) {
        const first = objectiveDiffs[0][obj.key];
        const last = objectiveDiffs[objectiveDiffs.length - 1][obj.key];
        const firstTotal = first.blue + first.red;
        const lastTotal = last.blue + last.red;
        seriesTrend = lastTotal - firstTotal;
      }

      // Base prediction: model prediction if available, else blend of series + season
      let basePredicted: number;
      if (obj.modelPred != null) {
        basePredicted = obj.modelPred;
      } else if (seasonTotalAvg > 0) {
        basePredicted = SERIES_WEIGHT * seriesTotalAvg + SEASON_WEIGHT * seasonTotalAvg;
      } else {
        basePredicted = seriesTotalAvg;
      }

      // Adjust based on series trend (damped: 20% of trend applied)
      const trendAdjustment = seriesTrend * 0.2;
      let adjusted = basePredicted + trendAdjustment;
      adjusted = Math.max(0, adjusted);

      // Range from model or calculated
      let range: [number, number];
      if (obj.modelRange) {
        range = obj.modelRange;
      } else {
        range = [
          Math.max(0, Math.round((adjusted - obj.stdDev) * 10) / 10),
          Math.round((adjusted + obj.stdDev) * 10) / 10,
        ];
      }

      // Per-team expected share based on series performance + momentum
      const blueShare = seriesTotalAvg > 0
        ? (seriesBlueAvg / seriesTotalAvg) * momMultiplier
        : 0.5;
      const clampedBlueShare = Math.max(0.1, Math.min(0.9, blueShare));
      const blueExpected = Math.round(adjusted * clampedBlueShare * 10) / 10;
      const redExpected = Math.round((adjusted - blueExpected) * 10) / 10;

      const favored: 'blue' | 'red' | 'even' =
        blueExpected > redExpected + 0.3 ? 'blue' :
        redExpected > blueExpected + 0.3 ? 'red' : 'even';

      return {
        key: obj.key,
        label: obj.label,
        basePredicted: Math.round(basePredicted * 10) / 10,
        adjusted: Math.round(adjusted * 10) / 10,
        range,
        seriesTrend: Math.round(seriesTrend * 10) / 10,
        seriesAvg: Math.round(seriesTotalAvg * 10) / 10,
        seasonAvg: Math.round(seasonTotalAvg * 10) / 10,
        favored,
        blueExpected,
        redExpected,
      };
    });

    return { gameNumber: nextGameNum, entries };
  }, [
    seriesTotals,
    objectiveDiffs,
    game.enrichment?.team_context,
    game.prediction?.predictions,
    momentum.lastWinnerCode,
    series,
    mainBlueCode,
    mainRedCode,
  ]);

  // -----------------------------------------------------------------------
  // hasData guard
  // -----------------------------------------------------------------------
  const completedWithData = (series ?? []).filter(
    sg => sg.state === 'completed' && sg.final_stats,
  ).length;

  const hasData = !!(
    series &&
    series.length > 1 &&
    (fearlessTracker.gamesCompleted >= 1 || completedWithData >= 1)
  );

  return {
    hasData,
    fearlessTracker,
    objectiveDiffs,
    seriesTotals,
    bluePerformance,
    redPerformance,
    momentum,
    adjustedPrediction,
    objectiveForecast,
    bluePool,
    redPool,
    sideTracker,
  };
}
