import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Target,
  Swords,
  Clock,
  Crosshair,
  Shield,
  TrendingUp,
  Flame,
  Crown,
  BarChart3,
} from 'lucide-react';
import {
  useTeamDetail,
  useTeamStats,
  useTeamMatches,
} from '@/hooks/useTeams';
import { FilterParams } from '@/types';
import { WinRateBar } from '@/components/common/WinRateBar';
import { FilterBar } from '@/components/common/FilterBar';
import { Loading } from '@/components/common/Loading';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { Pagination } from '@/components/common/Pagination';
import { SideWinRateChart } from '@/components/charts/SideWinRateChart';
import { GoldDiffChart } from '@/components/charts/GoldDiffChart';
import { cn } from '@/lib/utils';

type Tab = 'overview' | 'history' | 'early';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Visao Geral' },
  { id: 'history', label: 'Historico' },
  { id: 'early', label: 'Early Game' },
];

const PAGE_SIZE = 20;

function formatDuration(minutes: number | null): string {
  if (minutes === null || minutes === 0) return '--';
  const mins = Math.floor(minutes);
  const secs = Math.round((minutes - mins) * 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '--';
  }
}

function formatAvgDuration(avgMinutes: number): string {
  if (!avgMinutes) return '--';
  const mins = Math.floor(avgMinutes);
  const secs = Math.round((avgMinutes - mins) * 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export default function TeamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const teamId = id ? Number(id) : null;

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [filters, setFilters] = useState<FilterParams>({});
  const [historyFilters, setHistoryFilters] = useState<
    FilterParams & { page?: number }
  >({});
  const [historyPage, setHistoryPage] = useState(1);

  const { data: team, loading: teamLoading, error: teamError } =
    useTeamDetail(teamId);
  const { data: stats, loading: statsLoading } = useTeamStats(
    teamId,
    filters
  );
  const { data: matches, loading: matchesLoading } = useTeamMatches(teamId, {
    ...historyFilters,
    page: historyPage,
  });

  if (teamLoading) return <Loading />;
  if (teamError) return <ErrorMessage message={teamError} />;
  if (!team) return <ErrorMessage message="Time nao encontrado." />;

  function handleHistoryFilterChange(newFilters: {
    league?: number;
    year?: number;
    split?: string;
  }) {
    setHistoryFilters(newFilters);
    setHistoryPage(1);
  }

  const historyTotalPages = matches
    ? Math.ceil(matches.count / PAGE_SIZE)
    : 1;

  return (
    <div className="space-y-6">
      {/* Back navigation */}
      <Link
        to="/teams"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={16} />
        Voltar para Times
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">{team.name}</h1>
        {team.short_name && (
          <p className="text-muted-foreground mt-1">{team.short_name}</p>
        )}
        {team.leagues.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {team.leagues.map((league) => (
              <span
                key={league.id}
                className="px-2.5 py-1 text-xs font-medium rounded-full bg-primary/10 text-primary border border-primary/20"
              >
                {league.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Filters */}
      <FilterBar
        filters={filters}
        onChange={(f) => {
          setFilters(f);
          setHistoryFilters(f);
          setHistoryPage(1);
        }}
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab stats={stats} loading={statsLoading} />
      )}
      {activeTab === 'history' && (
        <HistoryTab
          teamId={teamId!}
          matches={matches}
          loading={matchesLoading}
          filters={historyFilters}
          onFilterChange={handleHistoryFilterChange}
          page={historyPage}
          totalPages={historyTotalPages}
          onPageChange={setHistoryPage}
        />
      )}
      {activeTab === 'early' && (
        <EarlyGameTab stats={stats} loading={statsLoading} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable stat row component for the tables
// ---------------------------------------------------------------------------

function StatRow({
  label,
  value,
  format,
  trend,
}: {
  label: string;
  value: number;
  format: 'percent' | 'avg' | 'duration';
  trend?: 'high-good' | 'low-good' | 'none';
}) {
  let displayValue: string;
  let colorClass = 'text-foreground';

  if (format === 'percent') {
    displayValue = `${value.toFixed(1)}%`;
    if (trend === 'high-good') {
      colorClass =
        value >= 60
          ? 'text-green-400'
          : value >= 50
            ? 'text-blue-400'
            : value >= 40
              ? 'text-yellow-400'
              : 'text-red-400';
    }
  } else if (format === 'duration') {
    displayValue = formatAvgDuration(value);
  } else {
    displayValue = value.toFixed(1);
  }

  return (
    <div className="flex items-center justify-between py-2.5 px-4 border-b border-border/30 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn('text-sm font-semibold', colorClass)}>
        {displayValue}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview Tab
// ---------------------------------------------------------------------------

function OverviewTab({
  stats,
  loading,
}: {
  stats: import('@/types').TeamStats | null;
  loading: boolean;
}) {
  if (loading) return <Loading />;
  if (!stats) return <ErrorMessage message="Estatisticas nao disponiveis." />;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <SummaryCard
          label="Win Rate"
          value={`${stats.win_rate.toFixed(1)}%`}
          sub={`${stats.wins}V ${stats.losses}D`}
          icon={Target}
          color={stats.win_rate >= 50 ? 'text-green-400' : 'text-red-400'}
        />
        <SummaryCard
          label="Partidas"
          value={String(stats.total_matches)}
          icon={Swords}
        />
        <SummaryCard
          label="Avg Game Time"
          value={formatAvgDuration(stats.avg_game_length)}
          icon={Clock}
        />
        <SummaryCard
          label="Avg Kills"
          value={stats.avg_kills.toFixed(1)}
          icon={Crosshair}
        />
        <SummaryCard
          label="Avg Deaths"
          value={stats.avg_deaths.toFixed(1)}
          icon={Shield}
        />
        <SummaryCard
          label="Avg Gold"
          value={`${(stats.avg_gold / 1000).toFixed(1)}k`}
          icon={TrendingUp}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* First Objective Rates (%) */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary/40 flex items-center gap-2">
            <Flame size={16} className="text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              Primeiro Objetivo (% por partida)
            </h3>
          </div>
          <div>
            <StatRow
              label="First Blood"
              value={stats.first_blood_rate}
              format="percent"
              trend="high-good"
            />
            <StatRow
              label="First Tower"
              value={stats.first_tower_rate}
              format="percent"
              trend="high-good"
            />
            <StatRow
              label="First Dragon"
              value={stats.first_dragon_rate}
              format="percent"
              trend="high-good"
            />
            <StatRow
              label="First Herald"
              value={stats.first_herald_rate}
              format="percent"
              trend="high-good"
            />
            <StatRow
              label="First Baron"
              value={stats.first_baron_rate}
              format="percent"
              trend="high-good"
            />
            <StatRow
              label="First Inhibitor"
              value={stats.first_inhibitor_rate}
              format="percent"
              trend="high-good"
            />
          </div>
        </div>

        {/* Averages per match */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary/40 flex items-center gap-2">
            <BarChart3 size={16} className="text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              Medias por Partida
            </h3>
          </div>
          <div>
            <StatRow
              label="Total Torres"
              value={stats.avg_towers}
              format="avg"
            />
            <StatRow
              label="Total Dragoes"
              value={stats.avg_dragons}
              format="avg"
            />
            <StatRow
              label="Total Nashors"
              value={stats.avg_barons}
              format="avg"
            />
            <StatRow
              label="Total Inibidores"
              value={stats.avg_inhibitors}
              format="avg"
            />
            <StatRow
              label="Total Arautos"
              value={stats.avg_heralds}
              format="avg"
            />
            <StatRow
              label="Total Voidgrubs"
              value={stats.avg_voidgrubs}
              format="avg"
            />
            <StatRow
              label="Game Time"
              value={stats.avg_game_length}
              format="duration"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Over/Under Rates */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary/40 flex items-center gap-2">
            <Crown size={16} className="text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              Over/Under (% por partida)
            </h3>
          </div>
          <div>
            <StatRow
              label="Kills Over 25"
              value={stats.kills_over_25_rate}
              format="percent"
              trend="high-good"
            />
            <StatRow
              label="Torres Over 10"
              value={stats.towers_over_10_rate}
              format="percent"
              trend="high-good"
            />
          </div>
        </div>

        {/* KDA */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary/40 flex items-center gap-2">
            <Shield size={16} className="text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              Combate (medias)
            </h3>
          </div>
          <div>
            <StatRow label="Kills" value={stats.avg_kills} format="avg" />
            <StatRow label="Deaths" value={stats.avg_deaths} format="avg" />
            <StatRow label="Assists" value={stats.avg_assists} format="avg" />
          </div>
        </div>

        {/* Recent Form */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary/40 flex items-center gap-2">
            <TrendingUp size={16} className="text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              Forma Recente
            </h3>
          </div>
          <div className="p-4 space-y-4">
            <WinRateBar
              winRate={stats.form_last5}
              label="Ultimas 5 partidas"
            />
            <WinRateBar
              winRate={stats.form_last10}
              label="Ultimas 10 partidas"
            />
            <WinRateBar
              winRate={stats.win_rate}
              label="Win Rate Geral"
            />
          </div>
        </div>
      </div>

      {/* Side Win Rate */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SideWinRateChart
          blueWins={stats.blue_wins}
          redWins={stats.red_wins}
        />
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-medium text-foreground mb-4">
            Detalhes por Lado
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-blue-400">Blue Side</span>
              <span className="text-muted-foreground">
                {stats.blue_wins}/{stats.blue_total} (
                {stats.blue_win_rate.toFixed(1)}%)
              </span>
            </div>
            <WinRateBar winRate={stats.blue_win_rate} />
            <div className="flex items-center justify-between text-sm mt-4">
              <span className="text-red-400">Red Side</span>
              <span className="text-muted-foreground">
                {stats.red_wins}/{stats.red_total} (
                {stats.red_win_rate.toFixed(1)}%)
              </span>
            </div>
            <WinRateBar winRate={stats.red_win_rate} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary Card
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: import('lucide-react').LucideIcon;
  color?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Icon size={16} className="text-muted-foreground" />
      </div>
      <p className={cn('text-xl font-bold', color || 'text-foreground')}>
        {value}
      </p>
      {sub && (
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// History Tab
// ---------------------------------------------------------------------------

function HistoryTab({
  teamId,
  matches,
  loading,
  filters,
  onFilterChange,
  page,
  totalPages,
  onPageChange,
}: {
  teamId: number;
  matches: import('@/types').PaginatedResponse<import('@/types').Match> | null;
  loading: boolean;
  filters: { league?: number; year?: number; split?: string };
  onFilterChange: (f: {
    league?: number;
    year?: number;
    split?: string;
  }) => void;
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <FilterBar filters={filters} onChange={onFilterChange} />

      {loading && <Loading />}

      {!loading && matches && (
        <>
          <p className="text-sm text-muted-foreground">
            {matches.count}{' '}
            {matches.count === 1 ? 'partida encontrada' : 'partidas encontradas'}
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-3 px-3 font-medium">Data</th>
                  <th className="text-left py-3 px-3 font-medium">
                    Adversario
                  </th>
                  <th className="text-center py-3 px-3 font-medium">Lado</th>
                  <th className="text-center py-3 px-3 font-medium">
                    Resultado
                  </th>
                  <th className="text-center py-3 px-3 font-medium">Liga</th>
                  <th className="text-right py-3 px-3 font-medium">
                    Duracao
                  </th>
                </tr>
              </thead>
              <tbody>
                {matches.results.map((match) => {
                  const isBlue = match.blue_team.id === teamId;
                  const opponent = isBlue
                    ? match.red_team
                    : match.blue_team;
                  const side = isBlue ? 'Blue' : 'Red';
                  const isWinner = match.winner?.id === teamId;

                  return (
                    <tr
                      key={match.id}
                      onClick={() => navigate(`/matches/${match.id}`)}
                      className="border-b border-border/50 hover:bg-secondary/50 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-3 text-muted-foreground">
                        {formatDate(match.date)}
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-medium text-foreground">
                          {opponent.name}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={cn(
                            'px-2 py-0.5 text-xs font-medium rounded',
                            side === 'Blue'
                              ? 'bg-blue-500/20 text-blue-400'
                              : 'bg-red-500/20 text-red-400'
                          )}
                        >
                          {side}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={cn(
                            'px-2.5 py-0.5 text-xs font-bold rounded',
                            isWinner
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-red-500/20 text-red-400'
                          )}
                        >
                          {isWinner ? 'W' : 'L'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center text-muted-foreground">
                        {match.league.name}
                      </td>
                      <td className="py-3 px-3 text-right text-muted-foreground">
                        {formatDuration(match.game_length)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {matches.results.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma partida encontrada com os filtros selecionados.
            </div>
          )}

          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Early Game Tab
// ---------------------------------------------------------------------------

function EarlyGameTab({
  stats,
  loading,
}: {
  stats: import('@/types').TeamStats | null;
  loading: boolean;
}) {
  if (loading) return <Loading />;
  if (!stats)
    return <ErrorMessage message="Estatisticas de early game nao disponiveis." />;

  return (
    <div className="space-y-6">
      {/* Gold / XP Diff Chart */}
      <GoldDiffChart
        golddiffat10={stats.avg_golddiffat10}
        golddiffat15={stats.avg_golddiffat15}
        xpdiffat10={stats.avg_xpdiffat10}
        xpdiffat15={stats.avg_xpdiffat15}
      />

      {/* Early Game Indicators */}
      <div className="bg-card border border-border rounded-lg p-5">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          Indicadores de Early Game
        </h3>
        <div className="space-y-4">
          <WinRateBar
            winRate={stats.first_blood_rate}
            label="First Blood Rate"
          />
          <WinRateBar
            winRate={stats.first_tower_rate}
            label="First Tower Rate"
          />
          <WinRateBar
            winRate={stats.first_dragon_rate}
            label="First Dragon Rate"
          />
          <WinRateBar
            winRate={stats.first_herald_rate}
            label="First Herald Rate"
          />
        </div>
      </div>
    </div>
  );
}
