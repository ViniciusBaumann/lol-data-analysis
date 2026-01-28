import { Link } from 'react-router-dom';
import {
  Radio, RefreshCw, Loader2, Skull, TowerControl, Flame, Crown, Coins,
} from 'lucide-react';
import { useLiveGames } from '@/hooks/useLiveGames';
import { LiveGame } from '@/types';

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

function fmtGold(gold: number): string {
  if (gold >= 1000) return `${(gold / 1000).toFixed(1)}k`;
  return String(gold);
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

function StatPill({ icon, label, blue, red }: {
  icon: React.ReactNode;
  label: string;
  blue: string | number;
  red: string | number;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="font-semibold text-blue-400 tabular-nums">{blue}</span>
      <div className="flex items-center gap-1 text-muted-foreground">
        {icon}
        <span className="text-[10px] uppercase tracking-wide">{label}</span>
      </div>
      <span className="font-semibold text-red-400 tabular-nums">{red}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LiveGameCard
// ---------------------------------------------------------------------------

function LiveGameCard({ game }: { game: LiveGame }) {
  const preds = game.prediction?.predictions ?? null;
  const blueWins = game.blue_team.result?.gameWins ?? 0;
  const redWins = game.red_team.result?.gameWins ?? 0;
  const hasStats = !!game.live_stats;

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

        {/* Live team stats (compact) */}
        {hasStats && (
          <div className="mt-4 space-y-1.5">
            <StatPill icon={<Skull size={11} className="text-red-400" />} label="Kills" blue={game.live_stats!.blue_kills} red={game.live_stats!.red_kills} />
            <StatPill icon={<Coins size={11} className="text-yellow-400" />} label="Gold" blue={fmtGold(game.live_stats!.blue_gold)} red={fmtGold(game.live_stats!.red_gold)} />
            <StatPill icon={<TowerControl size={11} className="text-sky-400" />} label="Towers" blue={game.live_stats!.blue_towers} red={game.live_stats!.red_towers} />
            <StatPill icon={<Flame size={11} className="text-orange-400" />} label="Dragons" blue={game.live_stats!.blue_dragons} red={game.live_stats!.red_dragons} />
            <StatPill icon={<Crown size={11} className="text-purple-400" />} label="Barons" blue={game.live_stats!.blue_barons} red={game.live_stats!.red_barons} />
          </div>
        )}

        {/* No stats available */}
        {!hasStats && !game.stats_enabled && (
          <p className="text-[10px] text-muted-foreground/50 text-center mt-3">
            Placar ao vivo indisponivel para esta liga
          </p>
        )}
      </div>

      {/* Win probability */}
      {preds && (
        <div className="px-4 pb-3">
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] font-bold">
              <span className={preds.blue_win_prob > preds.red_win_prob ? 'text-blue-400' : 'text-muted-foreground'}>
                {preds.blue_win_prob}%
              </span>
              <span className="text-muted-foreground text-[10px] uppercase tracking-widest">Win Prob</span>
              <span className={preds.red_win_prob > preds.blue_win_prob ? 'text-red-400' : 'text-muted-foreground'}>
                {preds.red_win_prob}%
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden flex bg-secondary">
              <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-500" style={{ width: `${preds.blue_win_prob}%` }} />
              <div className="h-full bg-gradient-to-r from-red-400 to-red-600 transition-all duration-500" style={{ width: `${preds.red_win_prob}%` }} />
            </div>
          </div>
        </div>
      )}

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
  const { games, loading, error, lastUpdated, refresh } = useLiveGames();

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
    </div>
  );
}
