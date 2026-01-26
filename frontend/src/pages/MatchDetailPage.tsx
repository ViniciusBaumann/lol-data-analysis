import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Clock, Shield, Trophy } from 'lucide-react';
import { format } from 'date-fns';
import { useMatchDetail } from '@/hooks/useMatches';
import { TeamMatchStats, PlayerMatchStats } from '@/types';
import { Loading } from '@/components/common/Loading';
import { ErrorMessage } from '@/components/common/ErrorMessage';
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
    return format(new Date(dateStr), 'dd/MM/yyyy HH:mm');
  } catch {
    return '--';
  }
}

// ---------------------------------------------------------------------------
// Stat Comparison Row
// ---------------------------------------------------------------------------

interface StatRowProps {
  label: string;
  value1: number;
  value2: number;
  format?: 'number' | 'gold';
  invert?: boolean;
}

function StatRow({ label, value1, value2, format: fmt = 'number', invert = false }: StatRowProps) {
  const better1 = invert ? value1 < value2 : value1 > value2;
  const better2 = invert ? value2 < value1 : value2 > value1;

  function formatVal(v: number): string {
    if (fmt === 'gold') return v.toLocaleString();
    return v.toFixed(0);
  }

  return (
    <div className="flex items-center py-2.5 border-b border-border/50">
      <div className="flex-1 text-left">
        <span
          className={cn(
            'text-sm font-medium',
            better1 ? 'text-green-400' : 'text-foreground'
          )}
        >
          {formatVal(value1)}
        </span>
      </div>
      <div className="flex-shrink-0 px-4 text-center">
        <span className="text-xs text-muted-foreground font-medium">
          {label}
        </span>
      </div>
      <div className="flex-1 text-right">
        <span
          className={cn(
            'text-sm font-medium',
            better2 ? 'text-green-400' : 'text-foreground'
          )}
        >
          {formatVal(value2)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Player Row
// ---------------------------------------------------------------------------

function PlayerRow({
  player,
  side,
}: {
  player: PlayerMatchStats;
  side: 'blue' | 'red';
}) {
  const bgClass =
    side === 'blue' ? 'bg-blue-500/5' : 'bg-red-500/5';
  const hoverClass =
    side === 'blue'
      ? 'hover:bg-blue-500/10'
      : 'hover:bg-red-500/10';

  return (
    <tr className={cn(bgClass, hoverClass, 'transition-colors')}>
      <td className="py-2.5 px-3">
        <span className="text-sm font-medium text-foreground">
          {player.player_name}
        </span>
      </td>
      <td className="py-2.5 px-3 text-sm text-muted-foreground">
        {player.champion}
      </td>
      <td className="py-2.5 px-3 text-center">
        <span
          className={cn(
            'px-2 py-0.5 text-xs font-medium rounded',
            side === 'blue'
              ? 'bg-blue-500/20 text-blue-400'
              : 'bg-red-500/20 text-red-400'
          )}
        >
          {player.position}
        </span>
      </td>
      <td className="py-2.5 px-3 text-center text-sm text-foreground font-medium">
        {player.kills}/{player.deaths}/{player.assists}
      </td>
      <td className="py-2.5 px-3 text-center text-sm text-muted-foreground">
        {player.cs}
        <span className="text-xs ml-1">
          ({player.cs_per_min.toFixed(1)}/min)
        </span>
      </td>
      <td className="py-2.5 px-3 text-center text-sm text-muted-foreground">
        {player.total_gold.toLocaleString()}
      </td>
      <td className="py-2.5 px-3 text-center text-sm text-muted-foreground">
        {player.damage_to_champions.toLocaleString()}
      </td>
      <td className="py-2.5 px-3 text-center text-sm text-muted-foreground">
        {player.vision_score}
      </td>
      <td className="py-2.5 px-3 text-center">
        <span
          className={cn(
            'text-sm font-bold',
            player.kda >= 5
              ? 'text-green-400'
              : player.kda >= 3
                ? 'text-blue-400'
                : player.kda >= 2
                  ? 'text-yellow-400'
                  : 'text-red-400'
          )}
        >
          {player.kda.toFixed(2)}
        </span>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Match Detail Page
// ---------------------------------------------------------------------------

export default function MatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const matchId = id ? Number(id) : null;

  const { data: match, loading, error } = useMatchDetail(matchId);

  if (loading) return <Loading />;
  if (error) return <ErrorMessage message={error} />;
  if (!match) return <ErrorMessage message="Partida nao encontrada." />;

  const blueTeamStats: TeamMatchStats | undefined = match.team_stats.find(
    (s) => s.side === 'Blue'
  );
  const redTeamStats: TeamMatchStats | undefined = match.team_stats.find(
    (s) => s.side === 'Red'
  );

  const bluePlayers = match.player_stats.filter(
    (p) => p.team === match.blue_team.id
  );
  const redPlayers = match.player_stats.filter(
    (p) => p.team === match.red_team.id
  );

  const blueWon = match.winner?.id === match.blue_team.id;
  const redWon = match.winner?.id === match.red_team.id;

  return (
    <div className="space-y-6">
      {/* Back navigation */}
      <Link
        to="/matches"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={16} />
        Voltar para Partidas
      </Link>

      {/* Match Header */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
          {/* Blue Team */}
          <div
            className={cn(
              'flex-1 text-center lg:text-right',
              blueWon && 'ring-2 ring-blue-500/30 rounded-lg p-4'
            )}
          >
            <Link
              to={`/teams/${match.blue_team.id}`}
              className="text-xl lg:text-2xl font-bold text-blue-400 hover:underline"
            >
              {match.blue_team.name}
            </Link>
            <p className="text-xs text-muted-foreground mt-1">Blue Side</p>
            {blueWon && (
              <div className="flex items-center justify-center lg:justify-end gap-1.5 mt-2">
                <Trophy size={14} className="text-amber-400" />
                <span className="text-xs font-medium text-amber-400">
                  Vencedor
                </span>
              </div>
            )}
          </div>

          {/* VS + Match Info */}
          <div className="flex flex-col items-center gap-2">
            <span className="text-2xl font-bold text-muted-foreground">VS</span>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>{formatDate(match.date)}</span>
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {formatDuration(match.game_length)}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
              <span className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary">
                {match.league.name}
              </span>
              {match.patch && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-secondary text-muted-foreground">
                  Patch {match.patch}
                </span>
              )}
              {match.playoffs && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-amber-500/20 text-amber-400">
                  Playoffs
                </span>
              )}
            </div>
          </div>

          {/* Red Team */}
          <div
            className={cn(
              'flex-1 text-center lg:text-left',
              redWon && 'ring-2 ring-red-500/30 rounded-lg p-4'
            )}
          >
            <Link
              to={`/teams/${match.red_team.id}`}
              className="text-xl lg:text-2xl font-bold text-red-400 hover:underline"
            >
              {match.red_team.name}
            </Link>
            <p className="text-xs text-muted-foreground mt-1">Red Side</p>
            {redWon && (
              <div className="flex items-center justify-center lg:justify-start gap-1.5 mt-2">
                <Trophy size={14} className="text-amber-400" />
                <span className="text-xs font-medium text-amber-400">
                  Vencedor
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Team Stats Comparison */}
      {blueTeamStats && redTeamStats && (
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-lg font-semibold text-foreground mb-4 text-center">
            Estatisticas do Time
          </h2>
          <div className="max-w-lg mx-auto">
            <div className="flex items-center py-2 border-b border-border">
              <div className="flex-1 text-left">
                <span className="text-xs font-medium text-blue-400 uppercase">
                  {match.blue_team.name}
                </span>
              </div>
              <div className="flex-shrink-0 px-4" />
              <div className="flex-1 text-right">
                <span className="text-xs font-medium text-red-400 uppercase">
                  {match.red_team.name}
                </span>
              </div>
            </div>

            <StatRow
              label="Kills"
              value1={blueTeamStats.kills}
              value2={redTeamStats.kills}
            />
            <StatRow
              label="Deaths"
              value1={blueTeamStats.deaths}
              value2={redTeamStats.deaths}
              invert
            />
            <StatRow
              label="Assists"
              value1={blueTeamStats.assists}
              value2={redTeamStats.assists}
            />
            <StatRow
              label="Gold"
              value1={blueTeamStats.total_gold}
              value2={redTeamStats.total_gold}
              format="gold"
            />
            <StatRow
              label="Dragons"
              value1={blueTeamStats.dragons}
              value2={redTeamStats.dragons}
            />
            <StatRow
              label="Barons"
              value1={blueTeamStats.barons}
              value2={redTeamStats.barons}
            />
            <StatRow
              label="Towers"
              value1={blueTeamStats.towers}
              value2={redTeamStats.towers}
            />
            <StatRow
              label="Heralds"
              value1={blueTeamStats.heralds}
              value2={redTeamStats.heralds}
            />
            <StatRow
              label="Inhibitors"
              value1={blueTeamStats.inhibitors}
              value2={redTeamStats.inhibitors}
            />
          </div>

          {/* First Objectives */}
          <div className="max-w-lg mx-auto mt-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-3 text-center">
              Primeiros Objetivos
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                {
                  label: 'Blood',
                  blue: blueTeamStats.first_blood,
                  red: redTeamStats.first_blood,
                },
                {
                  label: 'Dragon',
                  blue: blueTeamStats.first_dragon,
                  red: redTeamStats.first_dragon,
                },
                {
                  label: 'Herald',
                  blue: blueTeamStats.first_herald,
                  red: redTeamStats.first_herald,
                },
                {
                  label: 'Baron',
                  blue: blueTeamStats.first_baron,
                  red: redTeamStats.first_baron,
                },
                {
                  label: 'Tower',
                  blue: blueTeamStats.first_tower,
                  red: redTeamStats.first_tower,
                },
              ].map((obj) => (
                <div
                  key={obj.label}
                  className="bg-secondary/50 rounded-lg p-3 text-center"
                >
                  <p className="text-xs text-muted-foreground mb-1">
                    First {obj.label}
                  </p>
                  <div
                    className={cn(
                      'text-sm font-bold',
                      obj.blue
                        ? 'text-blue-400'
                        : obj.red
                          ? 'text-red-400'
                          : 'text-muted-foreground'
                    )}
                  >
                    {obj.blue
                      ? match.blue_team.short_name || 'Blue'
                      : obj.red
                        ? match.red_team.short_name || 'Red'
                        : '--'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Player Stats Table */}
      {match.player_stats.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Estatisticas dos Jogadores
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-3 px-3 font-medium">
                    Jogador
                  </th>
                  <th className="text-left py-3 px-3 font-medium">
                    Champion
                  </th>
                  <th className="text-center py-3 px-3 font-medium">
                    Posicao
                  </th>
                  <th className="text-center py-3 px-3 font-medium">K/D/A</th>
                  <th className="text-center py-3 px-3 font-medium">CS</th>
                  <th className="text-center py-3 px-3 font-medium">Gold</th>
                  <th className="text-center py-3 px-3 font-medium">Dano</th>
                  <th className="text-center py-3 px-3 font-medium">Visao</th>
                  <th className="text-center py-3 px-3 font-medium">KDA</th>
                </tr>
              </thead>
              <tbody>
                {/* Blue Team Header */}
                <tr className="bg-blue-500/10">
                  <td
                    colSpan={9}
                    className="py-2 px-3 text-xs font-bold text-blue-400 uppercase tracking-wide"
                  >
                    <div className="flex items-center gap-2">
                      <Shield size={14} />
                      {match.blue_team.name} - Blue Side
                      {blueWon && (
                        <Trophy size={12} className="text-amber-400" />
                      )}
                    </div>
                  </td>
                </tr>
                {bluePlayers.map((player) => (
                  <PlayerRow
                    key={player.id}
                    player={player}
                    side="blue"
                  />
                ))}

                {/* Red Team Header */}
                <tr className="bg-red-500/10">
                  <td
                    colSpan={9}
                    className="py-2 px-3 text-xs font-bold text-red-400 uppercase tracking-wide"
                  >
                    <div className="flex items-center gap-2">
                      <Shield size={14} />
                      {match.red_team.name} - Red Side
                      {redWon && (
                        <Trophy size={12} className="text-amber-400" />
                      )}
                    </div>
                  </td>
                </tr>
                {redPlayers.map((player) => (
                  <PlayerRow
                    key={player.id}
                    player={player}
                    side="red"
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Gold Diff at time markers (if available) */}
      {blueTeamStats && (blueTeamStats.golddiffat10 !== null || blueTeamStats.golddiffat15 !== null) && (
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Diferenca de Gold / XP (Blue Side)
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {blueTeamStats.golddiffat10 !== null && (
              <div className="bg-secondary/50 rounded-lg p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">
                  Gold Diff @10
                </p>
                <p
                  className={cn(
                    'text-lg font-bold',
                    blueTeamStats.golddiffat10 >= 0
                      ? 'text-green-400'
                      : 'text-red-400'
                  )}
                >
                  {blueTeamStats.golddiffat10 >= 0 ? '+' : ''}
                  {blueTeamStats.golddiffat10.toLocaleString()}
                </p>
              </div>
            )}
            {blueTeamStats.golddiffat15 !== null && (
              <div className="bg-secondary/50 rounded-lg p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">
                  Gold Diff @15
                </p>
                <p
                  className={cn(
                    'text-lg font-bold',
                    blueTeamStats.golddiffat15 >= 0
                      ? 'text-green-400'
                      : 'text-red-400'
                  )}
                >
                  {blueTeamStats.golddiffat15 >= 0 ? '+' : ''}
                  {blueTeamStats.golddiffat15.toLocaleString()}
                </p>
              </div>
            )}
            {blueTeamStats.xpdiffat10 !== null && (
              <div className="bg-secondary/50 rounded-lg p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">
                  XP Diff @10
                </p>
                <p
                  className={cn(
                    'text-lg font-bold',
                    blueTeamStats.xpdiffat10 >= 0
                      ? 'text-green-400'
                      : 'text-red-400'
                  )}
                >
                  {blueTeamStats.xpdiffat10 >= 0 ? '+' : ''}
                  {blueTeamStats.xpdiffat10.toLocaleString()}
                </p>
              </div>
            )}
            {blueTeamStats.xpdiffat15 !== null && (
              <div className="bg-secondary/50 rounded-lg p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">
                  XP Diff @15
                </p>
                <p
                  className={cn(
                    'text-lg font-bold',
                    blueTeamStats.xpdiffat15 >= 0
                      ? 'text-green-400'
                      : 'text-red-400'
                  )}
                >
                  {blueTeamStats.xpdiffat15 >= 0 ? '+' : ''}
                  {blueTeamStats.xpdiffat15.toLocaleString()}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
