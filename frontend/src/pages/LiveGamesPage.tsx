import { Link } from 'react-router-dom';
import { Radio, RefreshCw, Loader2, Clock } from 'lucide-react';
import { useLiveGames } from '@/hooks/useLiveGames';
import { LiveGame, ScheduleMatch } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function formatStartTime(startTime: string): string {
  if (!startTime) return '';
  try {
    const date = new Date(startTime);
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatUpcomingTime(startTime: string): string {
  if (!startTime) return '';
  try {
    const date = new Date(startTime);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 0) return 'Em breve';
    if (diffMins < 60) return `em ${diffMins}min`;
    if (diffMins < 1440) {
      const hours = Math.floor(diffMins / 60);
      return `em ${hours}h`;
    }
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LiveDot() {
  return (
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
    </span>
  );
}

// ---------------------------------------------------------------------------
// UpcomingMatchCard
// ---------------------------------------------------------------------------

function UpcomingMatchCard({ match }: { match: ScheduleMatch }) {
  const team1 = match.teams[0];
  const team2 = match.teams[1];

  return (
    <Link
      to={`/live/${match.match_id}`}
      className="block bg-card border border-border rounded-xl overflow-hidden transition-all hover:shadow-lg hover:shadow-primary/5 hover:border-primary/30"
    >
      {/* Header bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50 bg-secondary/20">
        {match.league.image && (
          <img src={match.league.image} alt="" className="h-4 w-4 object-contain opacity-80" />
        )}
        <span className="text-[11px] font-medium text-muted-foreground">{match.league.name}</span>
        {match.block_name && (
          <span className="text-[11px] text-muted-foreground/60">{match.block_name}</span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          <Clock size={12} className="text-muted-foreground/60" />
          <span className="text-[10px] font-medium text-muted-foreground">
            {formatUpcomingTime(match.start_time)}
          </span>
        </span>
      </div>

      {/* Teams */}
      <div className="px-4 py-4">
        <div className="flex items-center">
          {/* Team 1 */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            {team1?.image && (
              <img src={team1.image} alt="" className="h-9 w-9 object-contain shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground truncate">{team1?.code || 'TBD'}</p>
            </div>
          </div>

          {/* VS */}
          <div className="px-4">
            <span className="text-xs font-bold text-muted-foreground/50">VS</span>
          </div>

          {/* Team 2 */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0 justify-end">
            <div className="min-w-0 text-right">
              <p className="text-sm font-bold text-foreground truncate">{team2?.code || 'TBD'}</p>
            </div>
            {team2?.image && (
              <img src={team2.image} alt="" className="h-9 w-9 object-contain shrink-0" />
            )}
          </div>
        </div>
      </div>

      {/* Start time */}
      <div className="px-4 py-2 border-t border-border/50 bg-secondary/10 text-center">
        <span className="text-[10px] text-muted-foreground/50">
          {formatStartTime(match.start_time)}
        </span>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// LiveGameCard
// ---------------------------------------------------------------------------

function LiveGameCard({ game }: { game: LiveGame }) {
  const blueWins = game.blue_team.result?.gameWins ?? 0;
  const redWins = game.red_team.result?.gameWins ?? 0;

  return (
    <Link
      to={`/live/${game.match_id}`}
      className="block bg-card border border-border rounded-xl overflow-hidden transition-all hover:shadow-lg hover:shadow-primary/5 hover:border-primary/30"
    >
      {/* Header bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50 bg-secondary/20">
        {game.league.image && (
          <img src={game.league.image} alt="" className="h-4 w-4 object-contain opacity-80" />
        )}
        <span className="text-[11px] font-medium text-muted-foreground">{game.league.name}</span>
        {game.block_name && (
          <span className="text-[11px] text-muted-foreground/60">{game.block_name}</span>
        )}
        <span className="text-[11px] text-muted-foreground/60">{boLabel(game.strategy)}</span>
        {game.start_time && (
          <span className="text-[11px] text-muted-foreground/60">{formatStartTime(game.start_time)}</span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          <LiveDot />
          <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Live</span>
        </span>
      </div>

      {/* Teams + Score */}
      <div className="px-4 py-4">
        <div className="flex items-center">
          {/* Blue */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            {game.blue_team.image && (
              <img src={game.blue_team.image} alt="" className="h-9 w-9 object-contain shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground truncate">{game.blue_team.code}</p>
            </div>
          </div>

          {/* Score */}
          <div className="flex items-center gap-3 px-4">
            <span className="text-2xl font-black text-foreground tabular-nums">{blueWins}</span>
            <span className="text-xs text-muted-foreground/50 font-bold">:</span>
            <span className="text-2xl font-black text-foreground tabular-nums">{redWins}</span>
          </div>

          {/* Red */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0 justify-end">
            <div className="min-w-0 text-right">
              <p className="text-sm font-bold text-foreground truncate">{game.red_team.code}</p>
            </div>
            {game.red_team.image && (
              <img src={game.red_team.image} alt="" className="h-9 w-9 object-contain shrink-0" />
            )}
          </div>
        </div>
      </div>

      {/* Click hint */}
      <div className="px-4 py-2 border-t border-border/50 bg-secondary/10 text-center">
        <span className="text-[10px] text-muted-foreground/50">Clique para ver detalhes</span>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LiveGamesPage() {
  const { games, upcoming, loading, error, lastUpdated, refresh } = useLiveGames();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Radio className="h-6 w-6 text-red-400" />
          <h1 className="text-2xl font-bold text-foreground">Ao Vivo</h1>
          {lastUpdated && (
            <span className="text-[11px] text-muted-foreground/60">
              {timeAgo(lastUpdated)}
            </span>
          )}
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-secondary border border-border hover:bg-secondary/80 transition-colors text-muted-foreground disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">Carregando...</span>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* No games */}
      {!loading && !error && games.length === 0 && (
        <div className="text-center py-20 text-muted-foreground/50">
          <Radio size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-base font-medium">Nenhum jogo ao vivo no momento</p>
          <p className="text-sm mt-1">Volte mais tarde para acompanhar partidas.</p>
        </div>
      )}

      {/* Live Games */}
      {!loading && games.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {games.map((game) => (
            <LiveGameCard key={`${game.match_id}-${game.game_id || ''}`} game={game} />
          ))}
        </div>
      )}

      {/* Upcoming Matches */}
      {!loading && upcoming.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold text-foreground">Proximas Partidas</h2>
            <span className="text-xs text-muted-foreground/60">({upcoming.length})</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {upcoming.map((match) => (
              <UpcomingMatchCard key={match.match_id} match={match} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
