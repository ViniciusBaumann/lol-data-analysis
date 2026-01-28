import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Radio, RefreshCw, Loader2, Skull, TowerControl, Flame, Crown,
  Coins, ChevronLeft, Castle, Clock, TrendingUp, Award, Target, Swords,
} from 'lucide-react';
import { useLiveGames } from '@/hooks/useLiveGames';
import {
  LiveGame, SeriesGame, LiveGameDraft,
  LaneMatchup, SynergyPair, TeamContext, MatchPredictionEnriched,
  DraftPredictions, ScheduleMatch, CompareData,
} from '@/types';
import { getSchedule, getLiveGames } from '@/services/live';
import { getCompareData } from '@/services/compare';
import { cn } from '@/lib/utils';
import { GameScoreboard } from '@/components/live/GameScoreboard';
import { SeriesHeader } from '@/components/live/SeriesHeader';
import { CompletedGameSummary } from '@/components/live/CompletedGameSummary';

// Polling interval for live game detail (5 seconds)
const LIVE_DETAIL_POLL_INTERVAL = 5_000;

// ---------------------------------------------------------------------------
// Constants & Helpers
// ---------------------------------------------------------------------------

const ROLE_LABELS: Record<string, string> = {
  top: 'TOP', jng: 'JNG', mid: 'MID', bot: 'BOT', sup: 'SUP',
};

const POSITIONS = ['top', 'jng', 'mid', 'bot', 'sup'] as const;

function timeAgo(date: Date | null): string {
  if (!date) return '';
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return 'agora';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m`;
}

function boLabel(strategy: { type: string; count: number }): string {
  if (strategy.type === 'bestOf') return `Bo${strategy.count}`;
  return '';
}

// ---------------------------------------------------------------------------
// Live Dot
// ---------------------------------------------------------------------------

function LiveDot() {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Win Probability Bar
// ---------------------------------------------------------------------------

function WinProbBar({ blueProb, redProb }: { blueProb: number; redProb: number }) {
  const blueBetter = blueProb > redProb;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
      <div className="flex justify-between text-sm font-bold">
        <span className={blueBetter ? 'text-blue-400' : 'text-zinc-500'}>
          {blueProb}%
        </span>
        <span className="text-zinc-600 text-[10px] uppercase tracking-widest self-center">Win Probability</span>
        <span className={!blueBetter ? 'text-red-400' : 'text-zinc-500'}>
          {redProb}%
        </span>
      </div>
      <div className="h-3 rounded-full overflow-hidden flex bg-zinc-800">
        <div
          className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-500"
          style={{ width: `${blueProb}%` }}
        />
        <div
          className="h-full bg-gradient-to-r from-red-400 to-red-600 transition-all duration-500"
          style={{ width: `${redProb}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Series Timeline
// ---------------------------------------------------------------------------

function SeriesTimeline({ games, ddragonVersion }: { games: SeriesGame[]; ddragonVersion: string }) {
  const [expandedGame, setExpandedGame] = useState<number | null>(null);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center gap-1.5 mb-4">
        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
          Serie
        </span>
        <div className="flex-1 h-px bg-zinc-800" />
      </div>

      <div className="flex items-center gap-2 justify-center">
        {games.map((sg) => {
          const isCompleted = sg.state === 'completed';
          const isCurrent = sg.is_current;
          const isUnstarted = sg.state === 'unstarted';
          const hasData = !!(sg.draft || sg.final_stats || sg.players);

          return (
            <button
              key={sg.number}
              onClick={() => {
                if (isCompleted && hasData) {
                  setExpandedGame(expandedGame === sg.number ? null : sg.number);
                }
              }}
              className={cn(
                'relative flex items-center justify-center w-12 h-12 rounded-lg text-sm font-bold transition-all',
                isCurrent && 'bg-emerald-500/20 text-emerald-400 ring-2 ring-emerald-500/50',
                isCompleted && hasData && 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 cursor-pointer',
                isCompleted && !hasData && 'bg-zinc-800/50 text-zinc-600 cursor-default',
                isUnstarted && 'bg-zinc-800/30 text-zinc-700 cursor-default',
              )}
              disabled={isUnstarted || (isCompleted && !hasData)}
            >
              G{sg.number}
              {isCurrent && (
                <span className="absolute -top-1 -right-1">
                  <LiveDot />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {expandedGame !== null && (() => {
        const sg = games.find(g => g.number === expandedGame);
        if (!sg || (!sg.draft && !sg.final_stats && !sg.players)) return null;

        return (
          <div className="mt-4 p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
            <CompletedGameSummary game={sg} ddragonVersion={ddragonVersion} />
          </div>
        );
      })()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lane Matchups Panel
// ---------------------------------------------------------------------------

function LaneMatchupsPanel({ matchups }: { matchups: LaneMatchup[] }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">
        Matchups por Lane
      </p>
      <p className="text-[10px] text-zinc-600 mb-3">
        Historico de confrontos diretos entre os campeoes na mesma lane em todos os campeonatos do ano.
        O campeao com mais vitorias no matchup tem vantagem estatistica.
      </p>

      {/* Header */}
      <div className="flex items-center gap-2 pb-2 mb-2 border-b border-zinc-800">
        <div className="flex-1 text-right">
          <span className="text-[9px] font-semibold text-blue-400 uppercase">Blue</span>
        </div>
        <div className="w-20 text-center">
          <span className="text-[9px] font-semibold text-zinc-600 uppercase">V/D</span>
        </div>
        <div className="w-10 text-center">
          <span className="text-[9px] font-semibold text-zinc-600 uppercase">Lane</span>
        </div>
        <div className="w-20 text-center">
          <span className="text-[9px] font-semibold text-zinc-600 uppercase">V/D</span>
        </div>
        <div className="flex-1 text-left">
          <span className="text-[9px] font-semibold text-red-400 uppercase">Red</span>
        </div>
      </div>

      <div className="space-y-2">
        {matchups.map((mu) => {
          const hasData = mu.games > 0 && mu.blue_win_rate !== null;
          const blueAdv = hasData && mu.blue_wins > mu.red_wins;
          const redAdv = hasData && mu.red_wins > mu.blue_wins;

          return (
            <div key={mu.position} className="flex items-center gap-2">
              {/* Blue champion */}
              <div className={cn(
                'flex-1 text-right text-sm font-medium truncate',
                blueAdv ? 'text-blue-400' : 'text-zinc-400',
              )}>
                {mu.blue_champion}
              </div>

              {/* Blue wins/losses */}
              <div className="w-20 text-center">
                {hasData ? (
                  <div className="flex items-center justify-center gap-1">
                    <span className={cn(
                      'text-xs font-bold tabular-nums',
                      blueAdv ? 'text-blue-400' : 'text-zinc-500'
                    )}>
                      {mu.blue_wins}V
                    </span>
                    <span className="text-zinc-600">/</span>
                    <span className="text-xs font-bold tabular-nums text-zinc-500">
                      {mu.red_wins}D
                    </span>
                  </div>
                ) : (
                  <span className="text-[10px] text-zinc-700">-</span>
                )}
              </div>

              {/* Position */}
              <div className="w-10 text-center shrink-0">
                <span className="text-[10px] font-bold text-zinc-500 uppercase">
                  {ROLE_LABELS[mu.position] || mu.position}
                </span>
                {hasData && (
                  <p className="text-[9px] text-zinc-600">{mu.games}g</p>
                )}
              </div>

              {/* Red wins/losses */}
              <div className="w-20 text-center">
                {hasData ? (
                  <div className="flex items-center justify-center gap-1">
                    <span className={cn(
                      'text-xs font-bold tabular-nums',
                      redAdv ? 'text-red-400' : 'text-zinc-500'
                    )}>
                      {mu.red_wins}V
                    </span>
                    <span className="text-zinc-600">/</span>
                    <span className="text-xs font-bold tabular-nums text-zinc-500">
                      {mu.blue_wins}D
                    </span>
                  </div>
                ) : (
                  <span className="text-[10px] text-zinc-700">-</span>
                )}
              </div>

              {/* Red champion */}
              <div className={cn(
                'flex-1 text-left text-sm font-medium truncate',
                redAdv ? 'text-red-400' : 'text-zinc-400',
              )}>
                {mu.red_champion}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 pt-2 border-t border-zinc-800">
        <p className="text-[9px] text-zinc-600">
          <span className="font-semibold">V</span> = Vitorias do campeao neste matchup |{' '}
          <span className="font-semibold">D</span> = Derrotas do campeao neste matchup |{' '}
          <span className="font-semibold">g</span> = Total de jogos analisados
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team Context Panel (ELO, H2H, Form)
// ---------------------------------------------------------------------------

function TeamContextPanel({ context }: { context: TeamContext }) {
  const { blue_team, red_team, h2h } = context;
  const hasStats = blue_team.stats && red_team.stats;

  const rows = (items: { label: string; blue: number; red: number; suffix?: string }[]) =>
    items.map((row) => {
      const blueHigher = row.blue > row.red;
      const redHigher = row.red > row.blue;
      return (
        <div key={row.label} className="flex items-center justify-between text-xs">
          <span className={cn('font-bold tabular-nums', blueHigher ? 'text-blue-400' : 'text-zinc-500')}>
            {row.blue}{row.suffix ?? ''}
          </span>
          <span className="text-[10px] text-zinc-600">{row.label}</span>
          <span className={cn('font-bold tabular-nums', redHigher ? 'text-red-400' : 'text-zinc-500')}>
            {row.red}{row.suffix ?? ''}
          </span>
        </div>
      );
    });

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
        Contexto dos Times
      </p>

      {/* ELO */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold text-zinc-600 uppercase">ELO</p>
        {rows([
          { label: 'Global', blue: blue_team.elo.global, red: red_team.elo.global },
          { label: 'Blue Side', blue: blue_team.elo.blue, red: red_team.elo.blue },
          { label: 'Red Side', blue: blue_team.elo.red, red: red_team.elo.red },
        ])}
      </div>

      {/* H2H */}
      {h2h.total_games > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-zinc-600 uppercase">
            Confronto Direto ({h2h.total_games} jogos)
          </p>
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-blue-400">{h2h.blue_win_rate}%</span>
            <span className="text-[10px] text-zinc-600">Win Rate</span>
            <span className="font-bold text-red-400">{h2h.red_win_rate}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden flex bg-zinc-800">
            <div className="h-full bg-blue-500 transition-all" style={{ width: `${h2h.blue_win_rate}%` }} />
            <div className="h-full bg-red-500 transition-all" style={{ width: `${h2h.red_win_rate}%` }} />
          </div>
        </div>
      )}

      {/* Recent Form */}
      {hasStats && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-zinc-600 uppercase">Forma Recente</p>
          {rows([
            { label: 'Win Rate', blue: blue_team.stats!.win_rate, red: red_team.stats!.win_rate, suffix: '%' },
            { label: 'Ultimos 3', blue: blue_team.stats!.win_rate_last3, red: red_team.stats!.win_rate_last3, suffix: '%' },
            { label: 'Ultimos 5', blue: blue_team.stats!.win_rate_last5, red: red_team.stats!.win_rate_last5, suffix: '%' },
          ])}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Synergies Panel
// ---------------------------------------------------------------------------

function SynergiesPanel({ synergies }: {
  synergies: { blue: SynergyPair[]; red: SynergyPair[] };
}) {
  const hasBlueSyn = synergies.blue.length > 0;
  const hasRedSyn = synergies.red.length > 0;
  if (!hasBlueSyn && !hasRedSyn) return null;

  const renderPairs = (pairs: SynergyPair[], side: 'blue' | 'red') => (
    <div className="space-y-1">
      {pairs.map((p, i) => {
        // > 50% = good synergy (team color), < 50% = bad synergy (opposite color)
        const isGood = p.win_rate > 50;
        const isBad = p.win_rate < 50;
        const colorClass = isGood
          ? (side === 'blue' ? 'text-blue-400' : 'text-red-400')
          : isBad
          ? (side === 'blue' ? 'text-red-400' : 'text-blue-400')
          : 'text-zinc-500';

        return (
          <div key={i} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1 min-w-0 truncate">
              <span className="font-medium text-zinc-300">{p.champion1}</span>
              <span className="text-zinc-600">+</span>
              <span className="font-medium text-zinc-300">{p.champion2}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              <span className="text-[10px] text-zinc-600">{p.games}g</span>
              <span className={cn('font-bold tabular-nums', colorClass)}>
                {p.win_rate}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
        Sinergias do Draft
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {hasBlueSyn && (
          <div>
            <p className="text-[10px] font-bold text-blue-400 uppercase mb-1.5">Blue</p>
            {renderPairs(synergies.blue, 'blue')}
          </div>
        )}
        {hasRedSyn && (
          <div>
            <p className="text-[10px] font-bold text-red-400 uppercase mb-1.5">Red</p>
            {renderPairs(synergies.red, 'red')}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prediction Comparison Panel (Draft model vs Team model)
// ---------------------------------------------------------------------------

function PredictionComparisonPanel({ draftPred, matchPred }: {
  draftPred: DraftPredictions;
  matchPred: MatchPredictionEnriched;
}) {
  if (matchPred.error || matchPred.blue_win_prob === undefined) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
        Comparacao de Modelos
      </p>
      <div className="grid grid-cols-2 gap-4">
        {/* Draft model */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-zinc-600 uppercase">Modelo Draft</p>
          <div className="flex justify-between text-sm font-bold">
            <span className="text-blue-400">{draftPred.blue_win_prob}%</span>
            <span className="text-red-400">{draftPred.red_win_prob}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden flex bg-zinc-800">
            <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400" style={{ width: `${draftPred.blue_win_prob}%` }} />
            <div className="h-full bg-gradient-to-r from-red-400 to-red-600" style={{ width: `${draftPred.red_win_prob}%` }} />
          </div>
        </div>

        {/* Team model */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-zinc-600 uppercase">Modelo Time</p>
          <div className="flex justify-between text-sm font-bold">
            <span className="text-blue-400">{matchPred.blue_win_prob}%</span>
            <span className="text-red-400">{matchPred.red_win_prob}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden flex bg-zinc-800">
            <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400" style={{ width: `${matchPred.blue_win_prob}%` }} />
            <div className="h-full bg-gradient-to-r from-red-400 to-red-600" style={{ width: `${matchPred.red_win_prob}%` }} />
          </div>
        </div>
      </div>

      {/* Game time estimate */}
      {matchPred.game_time && (
        <div className="mt-3 text-center">
          <span className="text-[10px] text-zinc-600">Tempo estimado: </span>
          <span className="text-xs font-bold text-zinc-300">{matchPred.game_time} min</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team Comparison View (for scheduled matches)
// ---------------------------------------------------------------------------

function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  if (isToday) return `Hoje, ${time}`;
  if (isTomorrow) return `Amanha, ${time}`;

  return date.toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatComparison({ label, icon, value1, value2, format = 'number', higherIsBetter = true }: {
  label: string;
  icon: React.ReactNode;
  value1: number;
  value2: number;
  format?: 'number' | 'percent' | 'time';
  higherIsBetter?: boolean;
}) {
  const formatValue = (v: number) => {
    const safeV = v ?? 0;
    if (format === 'percent') return `${(safeV * 100).toFixed(1)}%`;
    if (format === 'time') return `${safeV.toFixed(1)}m`;
    return safeV.toFixed(1);
  };

  const winner1 = higherIsBetter ? value1 > value2 : value1 < value2;
  const winner2 = higherIsBetter ? value2 > value1 : value2 < value1;

  return (
    <div className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0">
      <span className={cn('text-sm font-semibold tabular-nums', winner1 ? 'text-blue-400' : 'text-zinc-500')}>
        {formatValue(value1)}
      </span>
      <div className="flex items-center gap-1.5 text-zinc-500">
        {icon}
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <span className={cn('text-sm font-semibold tabular-nums', winner2 ? 'text-red-400' : 'text-zinc-500')}>
        {formatValue(value2)}
      </span>
    </div>
  );
}

function ScheduleMatchView({ match, compareData, compareLoading }: {
  match: ScheduleMatch;
  compareData: CompareData | null;
  compareLoading: boolean;
}) {
  const team1 = match.teams[0];
  const team2 = match.teams[1];
  const isLive = match.state === 'inProgress';
  const isCompleted = match.state === 'completed';

  return (
    <div className="space-y-4">
      {/* Match Header */}
      <div className={cn(
        'bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden',
        isLive && 'border-red-500/30',
      )}>
        {/* League header */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
          {match.league.image && (
            <img src={match.league.image} alt="" className="h-4 w-4 object-contain opacity-80" />
          )}
          <span className="text-xs font-medium text-zinc-500">{match.league.name}</span>
          {match.block_name && (
            <span className="text-xs text-zinc-600">{match.block_name}</span>
          )}
          <span className="text-xs text-zinc-600">{boLabel(match.strategy)}</span>
        </div>

        {/* Teams */}
        <div className="px-6 py-6">
          <div className="flex items-center justify-between">
            {/* Team 1 */}
            <div className="flex flex-col items-center gap-2">
              {team1?.image && (
                <img src={team1.image} alt="" className="h-16 w-16 object-contain" />
              )}
              <span className="text-lg font-bold text-zinc-100">{team1?.name}</span>
              {isCompleted && team1?.result && (
                <span className="text-2xl font-black text-zinc-100">{team1.result.gameWins}</span>
              )}
            </div>

            {/* VS + Status */}
            <div className="flex flex-col items-center gap-2">
              {isLive ? (
                <span className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider bg-red-500/20 text-red-400 rounded-full flex items-center gap-1.5">
                  <LiveDot />
                  Ao Vivo
                </span>
              ) : isCompleted ? (
                <span className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider bg-zinc-800 text-zinc-500 rounded-full">
                  Finalizada
                </span>
              ) : (
                <span className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 rounded-full">
                  A Iniciar
                </span>
              )}
              {!isCompleted && (
                <span className="text-2xl font-black text-zinc-700">VS</span>
              )}
              {!isCompleted && (
                <div className="flex items-center gap-1.5 text-zinc-500">
                  <Clock size={14} />
                  <span className="text-sm">{formatDateTime(match.start_time)}</span>
                </div>
              )}
            </div>

            {/* Team 2 */}
            <div className="flex flex-col items-center gap-2">
              {team2?.image && (
                <img src={team2.image} alt="" className="h-16 w-16 object-contain" />
              )}
              <span className="text-lg font-bold text-zinc-100">{team2?.name}</span>
              {isCompleted && team2?.result && (
                <span className="text-2xl font-black text-zinc-100">{team2.result.gameWins}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Comparison Data */}
      {compareLoading && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-8 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
          <span className="ml-2 text-sm text-zinc-500">Carregando comparacao...</span>
        </div>
      )}

      {!compareLoading && compareData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Overall Stats */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={14} className="text-emerald-500" />
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Estatisticas {compareData.overall.split.label}
              </p>
            </div>
            <StatComparison
              label="Win Rate"
              icon={<Award size={12} />}
              value1={compareData.overall.split.team1.win_rate}
              value2={compareData.overall.split.team2.win_rate}
              format="percent"
            />
            <StatComparison
              label="Kills/Jogo"
              icon={<Skull size={12} className="text-red-400" />}
              value1={compareData.overall.split.team1.avg_kills}
              value2={compareData.overall.split.team2.avg_kills}
            />
            <StatComparison
              label="Torres/Jogo"
              icon={<TowerControl size={12} className="text-sky-400" />}
              value1={compareData.overall.split.team1.avg_towers}
              value2={compareData.overall.split.team2.avg_towers}
            />
            <StatComparison
              label="Dragoes/Jogo"
              icon={<Flame size={12} className="text-orange-400" />}
              value1={compareData.overall.split.team1.avg_dragons}
              value2={compareData.overall.split.team2.avg_dragons}
            />
          </div>

          {/* Head to Head */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Target size={14} className="text-emerald-500" />
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Confronto Direto
              </p>
            </div>
            {compareData.faceoffs.total > 0 ? (
              <>
                <div className="flex items-center justify-between py-3 mb-3 border-b border-zinc-800">
                  <div className="text-center">
                    <p className="text-2xl font-black text-blue-400">{compareData.faceoffs.team1_wins}</p>
                    <p className="text-[10px] text-zinc-600 uppercase">Vitorias</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-zinc-500">{compareData.faceoffs.total} jogos</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-black text-red-400">{compareData.faceoffs.team2_wins}</p>
                    <p className="text-[10px] text-zinc-600 uppercase">Vitorias</p>
                  </div>
                </div>
                <StatComparison
                  label="Kills/Jogo"
                  icon={<Skull size={12} className="text-red-400" />}
                  value1={compareData.faceoffs.team1.avg_kills}
                  value2={compareData.faceoffs.team2.avg_kills}
                />
              </>
            ) : (
              <div className="text-center py-6">
                <p className="text-sm text-zinc-600">Nenhum confronto direto encontrado</p>
              </div>
            )}
          </div>
        </div>
      )}

      {!compareLoading && !compareData && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-8 text-center">
          <p className="text-sm text-zinc-600">
            Dados de comparacao indisponiveis para estes times
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LiveGameDetailPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const { games: initialGames, loading: initialLoading, error, lastUpdated: initialLastUpdated, refresh: initialRefresh } = useLiveGames();

  // Local state for faster polling on live game detail
  const [liveGames, setLiveGames] = useState<LiveGame[]>([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [localLastUpdated, setLocalLastUpdated] = useState<Date | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Sync initial games to local state
  useEffect(() => {
    if (initialGames.length > 0) {
      setLiveGames(initialGames);
      setLocalLastUpdated(initialLastUpdated);
    }
  }, [initialGames, initialLastUpdated]);

  // Fast polling function for live game detail (5 seconds)
  const fetchLiveData = useCallback(async (silent: boolean = true) => {
    if (!silent) setLocalLoading(true);
    try {
      const data = await getLiveGames();
      setLiveGames(data.games);
      setLocalLastUpdated(new Date());
    } catch {
      // Keep previous data on error
    } finally {
      if (!silent) setLocalLoading(false);
    }
  }, []);

  // Set up fast polling when viewing a live game
  const games = liveGames.length > 0 ? liveGames : initialGames;
  const game = games.find(g => g.match_id === matchId);
  const isLiveGame = !!game;

  useEffect(() => {
    if (isLiveGame) {
      // Start fast polling for live game detail
      pollIntervalRef.current = setInterval(() => fetchLiveData(true), LIVE_DETAIL_POLL_INTERVAL);
      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      };
    }
  }, [isLiveGame, fetchLiveData]);

  // Combined state
  const loading = initialLoading || localLoading;
  const lastUpdated = localLastUpdated || initialLastUpdated;
  const refresh = useCallback(() => fetchLiveData(false), [fetchLiveData]);

  // State for scheduled match
  const [scheduleMatch, setScheduleMatch] = useState<ScheduleMatch | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [compareData, setCompareData] = useState<CompareData | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const hasPlayers = game?.players && (game.players.blue.length > 0 || game.players.red.length > 0);
  const hasSeries = game?.series_games && game.series_games.length > 1;
  const preds = game?.prediction?.predictions ?? null;

  // Check if current game in series is completed
  const isCurrentGameCompleted = game?.series_games?.find(
    sg => sg.game_id === game.game_id
  )?.state === 'completed';

  // Only show live player tables if game is in progress
  const showLivePlayerTables = hasPlayers && !isCurrentGameCompleted;

  // Check if game is awaiting start (no draft and no live stats)
  const isAwaitingStart = game && !isCurrentGameCompleted && !game.draft && !game.live_stats;

  // Fetch schedule if game not found in live games
  useEffect(() => {
    if (!loading && !game && matchId) {
      setScheduleLoading(true);
      getSchedule()
        .then((data) => {
          const found = [...(data.live || []), ...data.upcoming, ...data.completed].find(m => m.match_id === matchId);
          setScheduleMatch(found || null);

          if (found && found.teams[0]?.db_id && found.teams[1]?.db_id) {
            setCompareLoading(true);
            getCompareData(found.teams[0].db_id, found.teams[1].db_id)
              .then(setCompareData)
              .catch(() => setCompareData(null))
              .finally(() => setCompareLoading(false));
          }
        })
        .catch(() => setScheduleMatch(null))
        .finally(() => setScheduleLoading(false));
    }
  }, [loading, game, matchId]);

  const isLoadingAny = loading || scheduleLoading;
  const showScheduleView = !game && scheduleMatch && !scheduleLoading;

  return (
    <div className="space-y-4">
      {/* Back + Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/live"
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ChevronLeft size={14} />
            Partidas
          </Link>
          <div className="h-4 w-px bg-zinc-800" />
          {game && (
            <>
              {game.league.image && (
                <img src={game.league.image} alt="" className="h-5 w-5 object-contain opacity-80" />
              )}
              <span className="text-sm font-medium text-zinc-400">{game.league.name}</span>
              {game.block_name && (
                <span className="text-sm text-zinc-600">{game.block_name}</span>
              )}
              <span className="text-sm text-zinc-600">{boLabel(game.strategy)}</span>
              <div className="flex items-center gap-1.5">
                <LiveDot />
                <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Live</span>
              </div>
            </>
          )}
          {scheduleMatch && !game && (
            <>
              {scheduleMatch.league.image && (
                <img src={scheduleMatch.league.image} alt="" className="h-5 w-5 object-contain opacity-80" />
              )}
              <span className="text-sm font-medium text-zinc-400">{scheduleMatch.league.name}</span>
            </>
          )}
          {lastUpdated && (
            <span className="text-[10px] text-zinc-600">{timeAgo(lastUpdated)}</span>
          )}
        </div>
        {game && (
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 transition-colors text-zinc-400 disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        )}
      </div>

      {/* Loading */}
      {isLoadingAny && !game && !scheduleMatch && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
          <span className="ml-2 text-sm text-zinc-500">Carregando...</span>
        </div>
      )}

      {/* Error */}
      {error && !loading && !game && !scheduleMatch && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Scheduled Match View */}
      {showScheduleView && (
        <ScheduleMatchView
          match={scheduleMatch}
          compareData={compareData}
          compareLoading={compareLoading}
        />
      )}

      {/* Not found */}
      {!isLoadingAny && !error && !game && !scheduleMatch && (
        <div className="text-center py-20 text-zinc-600">
          <Radio size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-base font-medium">Partida nao encontrada</p>
          <p className="text-sm mt-1">A partida pode ter finalizado.</p>
          <Link to="/live" className="text-emerald-400 text-sm mt-3 inline-block hover:underline">
            Voltar para Ao Vivo
          </Link>
        </div>
      )}

      {/* Game Detail */}
      {game && (
        <>
          {/* Series Header (for Bo3/Bo5) */}
          {hasSeries && <SeriesHeader game={game} />}

          {/* Series Timeline */}
          {hasSeries && <SeriesTimeline games={game.series_games!} ddragonVersion={game.ddragon_version} />}

          {/* Awaiting Start - Show spinner when no draft and no live stats */}
          {isAwaitingStart && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-6 py-16">
              <div className="flex flex-col items-center justify-center gap-4">
                {/* Teams header */}
                <div className="flex items-center gap-6 mb-4">
                  <div className="flex items-center gap-2">
                    {game.blue_team.image && (
                      <img src={game.blue_team.image} alt="" className="h-10 w-10 object-contain" />
                    )}
                    <span className="text-lg font-bold text-blue-400">{game.blue_team.code}</span>
                  </div>
                  <span className="text-zinc-600 font-bold">vs</span>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-red-400">{game.red_team.code}</span>
                    {game.red_team.image && (
                      <img src={game.red_team.image} alt="" className="h-10 w-10 object-contain" />
                    )}
                  </div>
                </div>

                {/* Spinner */}
                <div className="relative">
                  <Loader2 className="h-10 w-10 animate-spin text-emerald-500" />
                </div>

                {/* Message */}
                <div className="text-center">
                  <p className="text-sm font-medium text-zinc-300">Aguardando inicio da partida</p>
                  <p className="text-xs text-zinc-600 mt-1">Os dados serao exibidos assim que o draft terminar</p>
                </div>

                {/* Live indicator */}
                <div className="flex items-center gap-2 mt-2">
                  <LiveDot />
                  <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Ao Vivo</span>
                </div>
              </div>
            </div>
          )}

          {/* Game content - only show when not awaiting start */}
          {!isAwaitingStart && (
            <>
              {/* Live Scoreboard (main content for live games) */}
              {!isCurrentGameCompleted && showLivePlayerTables && (
                <GameScoreboard game={game} ddragonVersion={game.ddragon_version} />
              )}

              {/* Win Probability (below scoreboard) */}
              {!isCurrentGameCompleted && preds && (
                <WinProbBar blueProb={preds.blue_win_prob} redProb={preds.red_win_prob} />
              )}

              {/* Predictions message */}
              {!isCurrentGameCompleted && !preds && game.draft && game.prediction?.message && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                  <p className="text-xs text-zinc-500 text-center">{game.prediction.message}</p>
                </div>
              )}

              {/* Predictions estimates */}
              {!isCurrentGameCompleted && preds && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Estimativas do Modelo</p>
                  <p className="text-[10px] text-zinc-600 mb-3">
                    Previsao de objetivos totais da partida baseada no draft e historico dos times.
                  </p>
                  <div className="grid grid-cols-4 gap-3 text-center">
                    {[
                      { icon: <Skull size={14} className="text-red-400" />, label: 'Kills', value: preds.total_kills },
                      { icon: <TowerControl size={14} className="text-sky-400" />, label: 'Towers', value: preds.total_towers },
                      { icon: <Flame size={14} className="text-orange-400" />, label: 'Dragons', value: preds.total_dragons },
                      { icon: <Crown size={14} className="text-purple-400" />, label: 'Barons', value: preds.total_barons },
                    ].map((s) => (
                      <div key={s.label}>
                        <div className="flex items-center justify-center gap-1 mb-1">{s.icon}</div>
                        <p className="text-lg font-bold text-zinc-100">{s.value}</p>
                        <p className="text-[9px] text-zinc-600 uppercase">{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Analytics Enrichment */}
              {!isCurrentGameCompleted && game.enrichment && (
                <>
                  {/* Prediction Comparison (draft model vs team model) */}
                  {preds && game.enrichment.match_prediction && (
                    <PredictionComparisonPanel
                      draftPred={preds}
                      matchPred={game.enrichment.match_prediction}
                    />
                  )}

                  {/* Lane Matchups */}
                  {game.enrichment.lane_matchups && game.enrichment.lane_matchups.length > 0 && (
                    <LaneMatchupsPanel matchups={game.enrichment.lane_matchups} />
                  )}

                  {/* Team Context + Synergies */}
                  {(game.enrichment.team_context || (game.enrichment.synergies && (game.enrichment.synergies.blue.length > 0 || game.enrichment.synergies.red.length > 0))) && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {game.enrichment.team_context && (
                        <TeamContextPanel context={game.enrichment.team_context} />
                      )}
                      {game.enrichment.synergies && (game.enrichment.synergies.blue.length > 0 || game.enrichment.synergies.red.length > 0) && (
                        <SynergiesPanel synergies={game.enrichment.synergies} />
                      )}
                    </div>
                  )}
                </>
              )}

              {/* No stats message - only show if stats not enabled for this league */}
              {!isCurrentGameCompleted && !game.live_stats && !game.stats_enabled && game.draft && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                  <p className="text-xs text-zinc-600 text-center">
                    Placar ao vivo indisponivel para esta liga
                  </p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
