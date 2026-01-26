import { BarChart3, Swords, Users, User, Trophy, Clock } from 'lucide-react';
import { useDashboard } from '@/hooks/useDashboard';
import { StatCard } from '@/components/common/StatCard';
import { WinRateBar } from '@/components/common/WinRateBar';
import { Loading } from '@/components/common/Loading';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { SideWinRateChart } from '@/components/charts/SideWinRateChart';
import { LeagueDistributionChart } from '@/components/charts/LeagueDistributionChart';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

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

export default function DashboardPage() {
  const { data, loading, error } = useDashboard();

  if (loading) return <Loading />;
  if (error) return <ErrorMessage message={error} />;
  if (!data) return <ErrorMessage message="Nenhum dado encontrado." />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BarChart3 className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Partidas"
          value={data.total_matches.toLocaleString()}
          icon={Swords}
        />
        <StatCard
          title="Times"
          value={data.total_teams.toLocaleString()}
          icon={Users}
        />
        <StatCard
          title="Jogadores"
          value={data.total_players.toLocaleString()}
          icon={User}
        />
        <StatCard
          title="Ligas"
          value={data.total_leagues.toLocaleString()}
          icon={Trophy}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Win Rate por Lado
          </h2>
          <SideWinRateChart
            blueWins={data.side_stats.blue_wins}
            redWins={data.side_stats.red_wins}
            total={data.side_stats.total}
          />
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Distribuicao por Liga
          </h2>
          <LeagueDistributionChart data={data.league_distribution} />
        </div>
      </div>

      {/* Top Teams */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">
            Top Times por Win Rate
          </h2>
          <Link
            to="/teams"
            className="text-sm text-primary hover:underline"
          >
            Ver todos
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-3 px-3 font-medium">#</th>
                <th className="text-left py-3 px-3 font-medium">Time</th>
                <th className="text-center py-3 px-3 font-medium">
                  Partidas
                </th>
                <th className="text-center py-3 px-3 font-medium">
                  Vitorias
                </th>
                <th className="text-left py-3 px-3 font-medium min-w-[180px]">
                  Win Rate
                </th>
              </tr>
            </thead>
            <tbody>
              {data.top_teams.map((team, index) => (
                <tr
                  key={team.id}
                  className="border-b border-border/50 hover:bg-secondary/50 transition-colors"
                >
                  <td className="py-3 px-3 text-muted-foreground font-medium">
                    {index + 1}
                  </td>
                  <td className="py-3 px-3">
                    <Link
                      to={`/teams/${team.id}`}
                      className="font-medium text-foreground hover:text-primary transition-colors"
                    >
                      {team.name}
                      {team.short_name && (
                        <span className="text-muted-foreground ml-2 text-xs">
                          ({team.short_name})
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="py-3 px-3 text-center text-muted-foreground">
                    {team.total_matches}
                  </td>
                  <td className="py-3 px-3 text-center text-muted-foreground">
                    {team.wins}
                  </td>
                  <td className="py-3 px-3">
                    <WinRateBar winRate={team.win_rate} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Matches */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">
            Partidas Recentes
          </h2>
          <Link
            to="/matches"
            className="text-sm text-primary hover:underline"
          >
            Ver todas
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-3 px-3 font-medium">Data</th>
                <th className="text-left py-3 px-3 font-medium">
                  Blue Team
                </th>
                <th className="text-center py-3 px-3 font-medium">vs</th>
                <th className="text-left py-3 px-3 font-medium">
                  Red Team
                </th>
                <th className="text-left py-3 px-3 font-medium">
                  Vencedor
                </th>
                <th className="text-left py-3 px-3 font-medium">Liga</th>
                <th className="text-right py-3 px-3 font-medium">
                  <div className="flex items-center justify-end gap-1">
                    <Clock size={14} />
                    Duracao
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.recent_matches.map((match) => (
                <tr
                  key={match.id}
                  className="border-b border-border/50 hover:bg-secondary/50 transition-colors cursor-pointer"
                >
                  <td className="py-3 px-3 text-muted-foreground">
                    {formatDate(match.date)}
                  </td>
                  <td className="py-3 px-3">
                    <Link
                      to={`/matches/${match.id}`}
                      className={cn(
                        'font-medium transition-colors hover:text-primary',
                        match.winner?.id === match.blue_team.id
                          ? 'text-blue-400'
                          : 'text-foreground'
                      )}
                    >
                      {match.blue_team.name}
                    </Link>
                  </td>
                  <td className="py-3 px-3 text-center text-muted-foreground">
                    vs
                  </td>
                  <td className="py-3 px-3">
                    <Link
                      to={`/matches/${match.id}`}
                      className={cn(
                        'font-medium transition-colors hover:text-primary',
                        match.winner?.id === match.red_team.id
                          ? 'text-red-400'
                          : 'text-foreground'
                      )}
                    >
                      {match.red_team.name}
                    </Link>
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={cn(
                        'font-medium',
                        match.winner?.id === match.blue_team.id
                          ? 'text-blue-400'
                          : 'text-red-400'
                      )}
                    >
                      {match.winner?.name ?? '--'}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-muted-foreground">
                    {match.league.name}
                  </td>
                  <td className="py-3 px-3 text-right text-muted-foreground">
                    {formatDuration(match.game_length)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
