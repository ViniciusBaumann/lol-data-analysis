import { memo } from 'react';
import { Loader2, Skull, TowerControl, Flame, Clock, TrendingUp, Award, Target, Crown, Shield } from 'lucide-react';
import { ScheduleMatch, CompareData } from '@/types';
import { cn } from '@/lib/utils';
import { LiveDot } from '../ui/LiveDot';

// ---------------------------------------------------------------------------
// Helpers
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

function boLabel(strategy: { type: string; count: number }): string {
  if (strategy.type === 'bestOf') return `Bo${strategy.count}`;
  return '';
}

// ---------------------------------------------------------------------------
// Stat Comparison Row
// ---------------------------------------------------------------------------

interface StatComparisonProps {
  label: string;
  icon: React.ReactNode;
  value1: number;
  value2: number;
  format?: 'number' | 'percent' | 'time';
  higherIsBetter?: boolean;
}

const StatComparison = memo(function StatComparison({
  label, icon, value1, value2, format = 'number', higherIsBetter = true
}: StatComparisonProps) {
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
});

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface ScheduleMatchViewProps {
  match: ScheduleMatch;
  compareData: CompareData | null;
  compareLoading: boolean;
}

function ScheduleMatchViewComponent({ match, compareData, compareLoading }: ScheduleMatchViewProps) {
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
        <div className="px-4 py-4 sm:px-6 sm:py-6">
          <div className="flex items-center justify-between">
            {/* Team 1 */}
            <div className="flex flex-col items-center gap-2">
              {team1?.image && (
                <img src={team1.image} alt="" className="h-10 w-10 sm:h-16 sm:w-16 object-contain" />
              )}
              <span className="text-sm sm:text-lg font-bold text-zinc-100 text-center">{team1?.name}</span>
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
                <img src={team2.image} alt="" className="h-10 w-10 sm:h-16 sm:w-16 object-contain" />
              )}
              <span className="text-sm sm:text-lg font-bold text-zinc-100 text-center">{team2?.name}</span>
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
                <StatComparison
                  label="Torres/Jogo"
                  icon={<TowerControl size={12} className="text-sky-400" />}
                  value1={compareData.faceoffs.team1.avg_towers}
                  value2={compareData.faceoffs.team2.avg_towers}
                />
                <StatComparison
                  label="Dragoes/Jogo"
                  icon={<Flame size={12} className="text-orange-400" />}
                  value1={compareData.faceoffs.team1.avg_dragons}
                  value2={compareData.faceoffs.team2.avg_dragons}
                />
                <StatComparison
                  label="Baroes/Jogo"
                  icon={<Crown size={12} className="text-purple-400" />}
                  value1={compareData.faceoffs.team1.avg_barons}
                  value2={compareData.faceoffs.team2.avg_barons}
                />
                <StatComparison
                  label="Inibidores/Jogo"
                  icon={<Shield size={12} className="text-amber-400" />}
                  value1={compareData.faceoffs.team1.avg_inhibitors}
                  value2={compareData.faceoffs.team2.avg_inhibitors}
                />
                {compareData.faceoffs.team1.avg_game_length && compareData.faceoffs.team2.avg_game_length && (
                  <StatComparison
                    label="Tempo Medio"
                    icon={<Clock size={12} className="text-zinc-400" />}
                    value1={compareData.faceoffs.team1.avg_game_length}
                    value2={compareData.faceoffs.team2.avg_game_length}
                    format="time"
                    higherIsBetter={false}
                  />
                )}
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

export const ScheduleMatchView = memo(ScheduleMatchViewComponent);
