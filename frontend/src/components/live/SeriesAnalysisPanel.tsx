import { memo } from 'react';
import {
  BarChart3,
  Shield,
  Skull,
  TowerControl,
  Flame,
  Crown,
  Coins,
  TrendingUp,
  TrendingDown,
  Zap,
  ChevronRight,
  Target,
  ArrowUp,
  ArrowDown,
  Minus,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSeriesAnalysis } from '@/hooks/useSeriesAnalysis';
import type {
  LiveGame,
  FearlessChampionEntry,
  GameObjectiveDiff,
  SeriesObjectiveTotals,
  ObjectiveSideStat,
  TeamObjectivePerformance,
  SeriesMomentum,
  SeriesAdjustedPrediction,
  SeriesSideTracker,
  ObjectiveForecast,
  ObjectiveForecastEntry,
} from '@/types';

// ---------------------------------------------------------------------------
// Constants & Helpers
// ---------------------------------------------------------------------------

const CHAMPION_KEY_MAP: Record<string, string> = {
  "Wukong": "MonkeyKing",
  "Renata Glasc": "Renata",
  "K'Sante": "KSante",
  "Kai'Sa": "Kaisa",
  "Kha'Zix": "Khazix",
  "Cho'Gath": "Chogath",
  "Vel'Koz": "Velkoz",
  "Kog'Maw": "KogMaw",
  "Rek'Sai": "RekSai",
  "Bel'Veth": "Belveth",
  "Nunu & Willump": "Nunu",
};

const POS_LABELS: Record<string, string> = {
  top: 'TOP', jng: 'JNG', mid: 'MID', bot: 'BOT', sup: 'SUP',
};

function getChampionKey(name: string): string {
  return CHAMPION_KEY_MAP[name] ?? name.replace(/['\s.]/g, '');
}

function champImg(ver: string, name: string): string {
  if (!ver || !name) return '';
  return `https://ddragon.leagueoflegends.com/cdn/${ver}/img/champion/${getChampionKey(name)}.png`;
}

function formatGold(gold: number): string {
  if (Math.abs(gold) >= 1000) return `${(gold / 1000).toFixed(1)}k`;
  return String(gold);
}

function diffColor(diff: number): string {
  if (diff > 0) return 'text-blue-400';
  if (diff < 0) return 'text-red-400';
  return 'text-zinc-500';
}

function diffPrefix(diff: number): string {
  return diff > 0 ? '+' : '';
}

// ---------------------------------------------------------------------------
// Section 1: Fearless Draft Tracker
// ---------------------------------------------------------------------------

interface FearlessDraftSectionProps {
  picks: FearlessChampionEntry[];
  allUsed: Set<string>;
  gamesCompleted: number;
  totalUsed: number;
  ddragonVersion: string;
  mainBlueCode: string;
  mainRedCode: string;
}

function FearlessDraftSection({
  picks,
  allUsed,
  gamesCompleted,
  totalUsed,
  ddragonVersion,
  mainBlueCode,
  mainRedCode,
}: FearlessDraftSectionProps) {
  // Group picks by game number
  const gameNumbers = [...new Set(picks.filter(p => !p.isCurrentGame).map(p => p.gameNumber))].sort();

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Shield size={14} className="text-amber-400" />
        <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
          Fearless Draft
        </span>
        <span className="text-[10px] text-zinc-500 ml-auto">
          {totalUsed} campeoes indisponiveis
        </span>
      </div>

      <div className="space-y-2">
        {gameNumbers.map(gn => {
          const gamePicks = picks.filter(p => p.gameNumber === gn && !p.isCurrentGame);
          const bluePicks = gamePicks.filter(p => p.side === 'blue');
          const redPicks = gamePicks.filter(p => p.side === 'red');
          const blueTeam = bluePicks[0]?.teamCode ?? mainBlueCode;
          const redTeam = redPicks[0]?.teamCode ?? mainRedCode;

          return (
            <div key={gn} className="flex items-center gap-3">
              {/* Game label */}
              <span className="text-[10px] font-bold text-zinc-600 w-8 shrink-0">G{gn}</span>

              {/* Blue picks */}
              <div className="flex-1 flex items-center gap-1">
                <span className="text-[9px] font-bold text-blue-400/70 w-8 shrink-0">{blueTeam}</span>
                {bluePicks.map((p, i) => (
                  <div key={i} className="relative group">
                    <img
                      src={champImg(ddragonVersion, p.champion)}
                      alt={p.champion}
                      title={`${p.champion} (${POS_LABELS[p.position] ?? p.position})`}
                      className="w-7 h-7 rounded bg-zinc-800 ring-1 ring-zinc-600 grayscale opacity-60"
                      loading="lazy"
                    />
                    <span className="absolute -bottom-0.5 -right-0.5 text-[7px] font-bold bg-zinc-700 text-zinc-400 rounded px-0.5 leading-tight">
                      {POS_LABELS[p.position]?.[0] ?? p.position[0]?.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>

              {/* Separator */}
              <div className="text-zinc-700">|</div>

              {/* Red picks */}
              <div className="flex-1 flex items-center justify-end gap-1">
                {redPicks.map((p, i) => (
                  <div key={i} className="relative group">
                    <img
                      src={champImg(ddragonVersion, p.champion)}
                      alt={p.champion}
                      title={`${p.champion} (${POS_LABELS[p.position] ?? p.position})`}
                      className="w-7 h-7 rounded bg-zinc-800 ring-1 ring-zinc-600 grayscale opacity-60"
                      loading="lazy"
                    />
                    <span className="absolute -bottom-0.5 -right-0.5 text-[7px] font-bold bg-zinc-700 text-zinc-400 rounded px-0.5 leading-tight">
                      {POS_LABELS[p.position]?.[0] ?? p.position[0]?.toUpperCase()}
                    </span>
                  </div>
                ))}
                <span className="text-[9px] font-bold text-red-400/70 w-8 shrink-0 text-right">{redTeam}</span>
              </div>
            </div>
          );
        })}

        {/* Current game picks (if any) */}
        {picks.some(p => p.isCurrentGame) && (() => {
          const currentPicks = picks.filter(p => p.isCurrentGame);
          const blueCurrent = currentPicks.filter(p => p.side === 'blue');
          const redCurrent = currentPicks.filter(p => p.side === 'red');
          const gn = currentPicks[0]?.gameNumber;

          return (
            <div className="flex items-center gap-3 pt-1 border-t border-zinc-800/50">
              <span className="text-[10px] font-bold text-emerald-500 w-8 shrink-0">G{gn}</span>
              <div className="flex-1 flex items-center gap-1">
                <span className="text-[9px] font-bold text-blue-400/70 w-8 shrink-0">
                  {blueCurrent[0]?.teamCode ?? mainBlueCode}
                </span>
                {blueCurrent.map((p, i) => (
                  <div key={i} className="relative">
                    <img
                      src={champImg(ddragonVersion, p.champion)}
                      alt={p.champion}
                      title={`${p.champion} (${POS_LABELS[p.position] ?? p.position})`}
                      className="w-7 h-7 rounded bg-zinc-800 ring-1 ring-blue-500/40"
                      loading="lazy"
                    />
                    <span className="absolute -bottom-0.5 -right-0.5 text-[7px] font-bold bg-blue-600 text-white rounded px-0.5 leading-tight">
                      {POS_LABELS[p.position]?.[0] ?? p.position[0]?.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
              <div className="text-zinc-700">|</div>
              <div className="flex-1 flex items-center justify-end gap-1">
                {redCurrent.map((p, i) => (
                  <div key={i} className="relative">
                    <img
                      src={champImg(ddragonVersion, p.champion)}
                      alt={p.champion}
                      title={`${p.champion} (${POS_LABELS[p.position] ?? p.position})`}
                      className="w-7 h-7 rounded bg-zinc-800 ring-1 ring-red-500/40"
                      loading="lazy"
                    />
                    <span className="absolute -bottom-0.5 -right-0.5 text-[7px] font-bold bg-red-600 text-white rounded px-0.5 leading-tight">
                      {POS_LABELS[p.position]?.[0] ?? p.position[0]?.toUpperCase()}
                    </span>
                  </div>
                ))}
                <span className="text-[9px] font-bold text-red-400/70 w-8 shrink-0 text-right">
                  {redCurrent[0]?.teamCode ?? mainRedCode}
                </span>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 2: Objective Differential Table
// ---------------------------------------------------------------------------

interface ObjectiveDiffSectionProps {
  diffs: GameObjectiveDiff[];
  totals: SeriesObjectiveTotals;
  blueTeamCode: string;
  redTeamCode: string;
}

const OBJ_COLS = [
  { key: 'kills' as const, label: 'Kills', icon: Skull, color: 'text-red-400' },
  { key: 'towers' as const, label: 'Torres', icon: TowerControl, color: 'text-sky-400' },
  { key: 'dragons' as const, label: 'Drag', icon: Flame, color: 'text-orange-400' },
  { key: 'barons' as const, label: 'Baron', icon: Crown, color: 'text-purple-400' },
  { key: 'gold' as const, label: 'Gold', icon: Coins, color: 'text-yellow-400' },
];

function ObjectiveDiffSection({ diffs, totals, blueTeamCode, redTeamCode }: ObjectiveDiffSectionProps) {
  if (diffs.length === 0) return null;

  // Check if stats are all zeros (PandaScore-only data has winner but no detailed stats)
  const hasDetailedStats = diffs.some(d =>
    d.kills.blue > 0 || d.kills.red > 0 || d.gold.blue > 0 || d.gold.red > 0,
  );

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 size={14} className="text-emerald-400" />
        <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
          Objetivos por Mapa
        </span>
      </div>

      {!hasDetailedStats && (
        <p className="text-[10px] text-zinc-600 mb-2">
          Estatisticas detalhadas indisponiveis — apenas vencedor por jogo
        </p>
      )}

      {/* Header */}
      {hasDetailedStats && (
        <div className="grid grid-cols-[48px_1fr_1fr_1fr_1fr_1fr] gap-1 mb-1">
          <div />
          {OBJ_COLS.map(col => (
            <div key={col.key} className="flex items-center justify-center gap-1">
              <col.icon size={10} className={col.color} />
              <span className="text-[9px] text-zinc-500 uppercase">{col.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Game rows - detailed view */}
      {hasDetailedStats && diffs.map(d => (
        <div
          key={d.gameNumber}
          className="grid grid-cols-[48px_1fr_1fr_1fr_1fr_1fr] gap-1 py-1.5 border-b border-zinc-800/30 last:border-0"
        >
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold text-zinc-500">G{d.gameNumber}</span>
            {d.winner && (
              <span className={cn('text-[8px] font-bold', d.winner === 'blue' ? 'text-blue-400' : 'text-red-400')}>
                {d.winner === 'blue' ? d.blueSide : d.redSide}
              </span>
            )}
          </div>
          {OBJ_COLS.map(col => {
            const stat: ObjectiveSideStat = d[col.key];
            const isGold = col.key === 'gold';
            return (
              <div key={col.key} className="flex flex-col items-center">
                <span className={cn('text-xs font-bold tabular-nums', diffColor(stat.diff))}>
                  {diffPrefix(stat.diff)}{isGold ? formatGold(stat.diff) : stat.diff}
                </span>
                <span className="text-[9px] text-zinc-600 tabular-nums">
                  {isGold ? `${formatGold(stat.blue)} x ${formatGold(stat.red)}` : `${stat.blue} x ${stat.red}`}
                </span>
              </div>
            );
          })}
        </div>
      ))}

      {/* Game rows - winner-only view (PandaScore) */}
      {!hasDetailedStats && diffs.map(d => (
        <div
          key={d.gameNumber}
          className="flex items-center gap-3 py-1.5 border-b border-zinc-800/30 last:border-0"
        >
          <span className="text-[10px] font-bold text-zinc-500 w-8">G{d.gameNumber}</span>
          {d.winner ? (
            <span className={cn('text-xs font-bold', d.winner === 'blue' ? 'text-blue-400' : 'text-red-400')}>
              {d.winner === 'blue' ? d.blueSide : d.redSide}
            </span>
          ) : (
            <span className="text-xs text-zinc-600">—</span>
          )}
        </div>
      ))}

      {/* Totals row */}
      {hasDetailedStats && diffs.length >= 2 && (
        <div className="grid grid-cols-[48px_1fr_1fr_1fr_1fr_1fr] gap-1 pt-2 mt-1 border-t border-zinc-700">
          <span className="text-[10px] font-bold text-zinc-400">Total</span>
          {OBJ_COLS.map(col => {
            const stat: ObjectiveSideStat = totals[col.key];
            const isGold = col.key === 'gold';
            return (
              <div key={col.key} className="flex flex-col items-center">
                <span className={cn('text-xs font-black tabular-nums', diffColor(stat.diff))}>
                  {diffPrefix(stat.diff)}{isGold ? formatGold(stat.diff) : stat.diff}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 3: Momentum + Performance + Adjusted Prediction
// ---------------------------------------------------------------------------

interface MomentumSectionProps {
  momentum: SeriesMomentum;
  adjustedPrediction: SeriesAdjustedPrediction | null;
  bluePerformance: TeamObjectivePerformance[];
  redPerformance: TeamObjectivePerformance[];
  blueTeam: { name: string; code: string; image?: string };
  redTeam: { name: string; code: string; image?: string };
  sideTracker: SeriesSideTracker;
}

function MomentumSection({
  momentum,
  adjustedPrediction,
  bluePerformance,
  redPerformance,
  blueTeam,
  redTeam,
  sideTracker,
}: MomentumSectionProps) {
  const hasPerf = bluePerformance.length > 0 || redPerformance.length > 0;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Zap size={14} className="text-yellow-400" />
        <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
          Momentum & Predicao Ajustada
        </span>
      </div>

      <div className="space-y-3">
        {/* Momentum trail */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500 w-16 shrink-0">Resultado</span>
          <div className="flex items-center gap-1">
            {momentum.momentumTrail.map((entry, i) => (
              <div
                key={i}
                className={cn(
                  'w-8 h-6 rounded flex items-center justify-center text-[9px] font-bold',
                  entry.teamCode === blueTeam.code
                    ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30'
                    : 'bg-red-500/20 text-red-400 ring-1 ring-red-500/30',
                )}
                title={`Game ${entry.gameNumber}: ${entry.teamCode} venceu`}
              >
                {entry.teamCode}
              </div>
            ))}
          </div>
          {momentum.currentStreak >= 2 && (
            <span className={cn(
              'text-[10px] font-bold ml-2',
              momentum.lastWinnerCode === blueTeam.code ? 'text-blue-400' : 'text-red-400',
            )}>
              {momentum.lastWinnerCode} {momentum.currentStreak}W streak
            </span>
          )}
        </div>

        {/* Side tracker */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500 w-16 shrink-0">Lados</span>
          <div className="flex items-center gap-1">
            {sideTracker.gamesSides.map((gs, i) => (
              <div key={i} className="flex items-center gap-0.5 bg-zinc-800/50 rounded px-1.5 py-0.5">
                <span className="text-[8px] font-bold text-blue-400">{gs.blueTeamCode}</span>
                <span className="text-[8px] text-zinc-600">vs</span>
                <span className="text-[8px] font-bold text-red-400">{gs.redTeamCode}</span>
              </div>
            ))}
          </div>
          {sideTracker.nextBlueTeamCode && (
            <>
              <ChevronRight size={10} className="text-zinc-600" />
              <span className="text-[10px] text-zinc-500">
                Proximo: <span className="font-bold text-blue-400">{sideTracker.nextBlueTeamCode}</span> Blue
              </span>
            </>
          )}
        </div>

        {/* Performance vs season average */}
        {hasPerf && (
          <div className="grid grid-cols-2 gap-3">
            {[
              { perf: bluePerformance, team: blueTeam, color: 'blue' as const },
              { perf: redPerformance, team: redTeam, color: 'red' as const },
            ].map(({ perf, team, color }) => (
              <div key={color} className="bg-zinc-800/30 rounded-lg p-2">
                <p className={cn('text-[10px] font-bold mb-1.5', color === 'blue' ? 'text-blue-400' : 'text-red-400')}>
                  {team.code} vs Media
                </p>
                <div className="space-y-1">
                  {perf.map(p => (
                    <div key={p.metric} className="flex items-center justify-between">
                      <span className="text-[10px] text-zinc-500">{p.metric}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-zinc-400 tabular-nums">
                          {p.seriesAvg.toFixed(1)}
                        </span>
                        <span className="text-[9px] text-zinc-600">/</span>
                        <span className="text-[10px] text-zinc-500 tabular-nums">
                          {p.seasonAvg.toFixed(1)}
                        </span>
                        {p.delta !== 0 && (
                          <span className={cn(
                            'text-[9px] font-bold tabular-nums flex items-center gap-0.5',
                            p.delta > 0 ? 'text-emerald-400' : 'text-amber-400',
                          )}>
                            {p.delta > 0 ? <TrendingUp size={8} /> : <TrendingDown size={8} />}
                            {p.delta > 0 ? '+' : ''}{p.deltaPercent.toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Adjusted prediction */}
        {adjustedPrediction && (
          <div className="bg-zinc-800/50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
                Predicao Ajustada (proximo mapa)
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-600">
                  Base: {adjustedPrediction.baseBlueProbability}%
                </span>
                <ChevronRight size={10} className="text-zinc-600" />
                <span className={cn(
                  'text-xs font-black',
                  adjustedPrediction.adjustedBlueProbability > 50 ? 'text-blue-400' : 'text-red-400',
                )}>
                  {adjustedPrediction.adjustedBlueProbability}%
                </span>
              </div>
            </div>

            {/* Probability bar */}
            <div className="relative h-2.5 rounded-full overflow-hidden flex bg-zinc-700 mb-2">
              <div
                className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-500"
                style={{ width: `${adjustedPrediction.adjustedBlueProbability}%` }}
              />
              <div
                className="h-full bg-gradient-to-r from-red-400 to-red-600 transition-all duration-500"
                style={{ width: `${100 - adjustedPrediction.adjustedBlueProbability}%` }}
              />
              {/* Base marker */}
              {Math.abs(adjustedPrediction.adjustedBlueProbability - adjustedPrediction.baseBlueProbability) >= 0.5 && (
                <div
                  className="absolute top-0 h-full flex flex-col items-center pointer-events-none"
                  style={{ left: `${adjustedPrediction.baseBlueProbability}%` }}
                >
                  <div className="w-0.5 h-full bg-zinc-400/60" />
                </div>
              )}
            </div>

            {/* Adjustment factors */}
            <div className="flex flex-wrap gap-1.5">
              {adjustedPrediction.adjustments.map((adj, i) => (
                <div
                  key={i}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium',
                    adj.value > 0
                      ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400'
                      : adj.value < 0
                        ? 'bg-red-500/10 border border-red-500/20 text-red-400'
                        : 'bg-zinc-800 border border-zinc-700 text-zinc-400',
                  )}
                  title={adj.description}
                >
                  <span>{adj.label}</span>
                  <span className="font-bold">
                    {adj.value > 0 ? '+' : ''}{adj.value.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 5: Objective Forecast for Next Map
// ---------------------------------------------------------------------------

const FORECAST_ICONS: Record<string, { icon: typeof Skull; color: string }> = {
  kills: { icon: Skull, color: 'text-red-400' },
  towers: { icon: TowerControl, color: 'text-sky-400' },
  dragons: { icon: Flame, color: 'text-orange-400' },
  barons: { icon: Crown, color: 'text-purple-400' },
};

interface ObjectiveForecastSectionProps {
  forecast: ObjectiveForecast;
  blueTeamCode: string;
  redTeamCode: string;
}

function ObjectiveForecastSection({ forecast, blueTeamCode, redTeamCode }: ObjectiveForecastSectionProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Target size={14} className="text-cyan-400" />
        <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
          Previsao de Objetivos — Game {forecast.gameNumber}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {forecast.entries.map(entry => {
          const iconDef = FORECAST_ICONS[entry.key];
          const IconComp = iconDef?.icon ?? Target;
          const iconColor = iconDef?.color ?? 'text-zinc-400';

          return (
            <div key={entry.key} className="bg-zinc-800/40 rounded-lg p-3">
              {/* Header: icon + label */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <IconComp size={14} className={iconColor} />
                  <span className="text-[10px] text-zinc-400 uppercase font-semibold">{entry.label}</span>
                </div>
                {/* Trend arrow */}
                {entry.seriesTrend !== 0 && (
                  <div className={cn(
                    'flex items-center gap-0.5 text-[9px] font-bold',
                    entry.seriesTrend > 0 ? 'text-emerald-400' : 'text-amber-400',
                  )}>
                    {entry.seriesTrend > 0 ? <ArrowUp size={9} /> : <ArrowDown size={9} />}
                    {entry.seriesTrend > 0 ? '+' : ''}{entry.seriesTrend}
                  </div>
                )}
                {entry.seriesTrend === 0 && (
                  <div className="flex items-center gap-0.5 text-[9px] text-zinc-600">
                    <Minus size={9} />
                    <span>estavel</span>
                  </div>
                )}
              </div>

              {/* Main predicted value */}
              <div className="text-center mb-2">
                <p className="text-xl font-black text-zinc-100 tabular-nums">{entry.adjusted}</p>
                <p className="text-[9px] text-zinc-600 tabular-nums">{entry.range[0]} - {entry.range[1]}</p>
              </div>

              {/* Blue vs Red expected split bar */}
              <div className="mb-1.5">
                <div className="flex justify-between mb-0.5">
                  <span className="text-[9px] font-bold text-blue-400 tabular-nums">
                    {blueTeamCode} {entry.blueExpected}
                  </span>
                  <span className="text-[9px] font-bold text-red-400 tabular-nums">
                    {entry.redExpected} {redTeamCode}
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden flex bg-zinc-700">
                  {(entry.blueExpected + entry.redExpected) > 0 && (
                    <>
                      <div
                        className="h-full bg-blue-500/60 transition-all duration-300"
                        style={{ width: `${(entry.blueExpected / (entry.blueExpected + entry.redExpected)) * 100}%` }}
                      />
                      <div
                        className="h-full bg-red-500/60 transition-all duration-300"
                        style={{ width: `${(entry.redExpected / (entry.blueExpected + entry.redExpected)) * 100}%` }}
                      />
                    </>
                  )}
                </div>
              </div>

              {/* Context: series avg vs season avg */}
              <div className="flex items-center justify-between text-[9px] text-zinc-600">
                <span>Serie: <span className="text-zinc-400 font-bold">{entry.seriesAvg}</span></span>
                <span>Season: <span className="text-zinc-400 font-bold">{entry.seasonAvg}</span></span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Game Time Forecast */}
      {forecast.gameTime && (
        <div className="mt-2 bg-zinc-800/40 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Clock size={14} className="text-teal-400" />
              <span className="text-[10px] text-zinc-400 uppercase font-semibold">Tempo de Jogo</span>
            </div>
            {forecast.gameTime.seriesTrend !== 0 && (
              <div className={cn(
                'flex items-center gap-0.5 text-[9px] font-bold',
                forecast.gameTime.seriesTrend > 0 ? 'text-emerald-400' : 'text-amber-400',
              )}>
                {forecast.gameTime.seriesTrend > 0 ? <ArrowUp size={9} /> : <ArrowDown size={9} />}
                {forecast.gameTime.seriesTrend > 0 ? '+' : ''}{forecast.gameTime.seriesTrend} min
              </div>
            )}
            {forecast.gameTime.seriesTrend === 0 && (
              <div className="flex items-center gap-0.5 text-[9px] text-zinc-600">
                <Minus size={9} />
                <span>estavel</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-black text-zinc-100 tabular-nums">{forecast.gameTime.predicted}</span>
              <span className="text-[10px] text-zinc-500">min</span>
            </div>
            <span className="text-[9px] text-zinc-600 tabular-nums">
              {forecast.gameTime.range[0]} - {forecast.gameTime.range[1]}
            </span>
            {forecast.gameTime.seriesAvg != null && (
              <span className="text-[9px] text-zinc-600 ml-auto">
                Serie: <span className="text-zinc-400 font-bold">{forecast.gameTime.seriesAvg} min</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

interface SeriesAnalysisPanelProps {
  game: LiveGame;
  ddragonVersion: string;
}

function SeriesAnalysisPanelComponent({ game, ddragonVersion }: SeriesAnalysisPanelProps) {
  const analysis = useSeriesAnalysis(game);

  if (!analysis.hasData) {
    console.warn('[SeriesAnalysisPanel] hasData=false — painel nao renderizado');
    return null;
  }

  if (analysis.objectiveDiffs.length === 0) {
    console.warn('[SeriesAnalysisPanel] Nenhum objectiveDiff — jogos completados sem final_stats');
  }
  if (!analysis.adjustedPrediction) {
    console.warn('[SeriesAnalysisPanel] adjustedPrediction nulo — prediction ou games completados ausentes');
  }
  if (!analysis.objectiveForecast) {
    console.warn('[SeriesAnalysisPanel] objectiveForecast nulo — sem dados suficientes para previsao');
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-800/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-amber-400" />
            <span className="text-sm font-semibold text-zinc-200">Analise da Serie</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-zinc-500">
              {analysis.fearlessTracker.gamesCompleted} jogo(s) | {analysis.fearlessTracker.totalUsed} picks usados
            </span>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Fearless Draft */}
        <FearlessDraftSection
          picks={analysis.fearlessTracker.picks}
          allUsed={analysis.fearlessTracker.allUsedChampions}
          gamesCompleted={analysis.fearlessTracker.gamesCompleted}
          totalUsed={analysis.fearlessTracker.totalUsed}
          ddragonVersion={ddragonVersion}
          mainBlueCode={game.blue_team.code}
          mainRedCode={game.red_team.code}
        />

        <div className="h-px bg-zinc-800" />

        {/* Objective Differentials */}
        <ObjectiveDiffSection
          diffs={analysis.objectiveDiffs}
          totals={analysis.seriesTotals}
          blueTeamCode={game.blue_team.code}
          redTeamCode={game.red_team.code}
        />

        <div className="h-px bg-zinc-800" />

        {/* Objective Forecast for Next Map */}
        {analysis.objectiveForecast && (
          <>
            <ObjectiveForecastSection
              forecast={analysis.objectiveForecast}
              blueTeamCode={game.blue_team.code}
              redTeamCode={game.red_team.code}
            />
            <div className="h-px bg-zinc-800" />
          </>
        )}

        {/* Momentum + Performance + Prediction */}
        <MomentumSection
          momentum={analysis.momentum}
          adjustedPrediction={analysis.adjustedPrediction}
          bluePerformance={analysis.bluePerformance}
          redPerformance={analysis.redPerformance}
          blueTeam={game.blue_team}
          redTeam={game.red_team}
          sideTracker={analysis.sideTracker}
        />

      </div>
    </div>
  );
}

export const SeriesAnalysisPanel = memo(SeriesAnalysisPanelComponent);
