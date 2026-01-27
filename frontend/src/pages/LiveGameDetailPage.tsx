import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Radio, RefreshCw, Loader2, Skull, TowerControl, Flame, Crown,
  Coins, ChevronLeft,
} from 'lucide-react';
import { useLiveGames } from '@/hooks/useLiveGames';
import { LiveGame, LivePlayerStats, SeriesGame, LiveGameDraft } from '@/types';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Constants & Helpers
// ---------------------------------------------------------------------------

const ROLE_LABELS: Record<string, string> = {
  top: 'TOP', jng: 'JNG', mid: 'MID', bot: 'BOT', sup: 'SUP',
};

const POSITIONS = ['top', 'jng', 'mid', 'bot', 'sup'] as const;

const TRINKET_IDS = new Set([3340, 3363, 3364]);

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

function fmtGoldFull(gold: number): string {
  return gold.toLocaleString('en-us');
}

function champImgUrl(ver: string, key: string): string {
  if (!ver || !key) return '';
  return `https://ddragon.leagueoflegends.com/cdn/${ver}/img/champion/${key}.png`;
}

function itemImgUrl(ver: string, id: number): string {
  if (!ver || !id) return '';
  return `https://ddragon.leagueoflegends.com/cdn/${ver}/img/item/${id}.png`;
}

function separateItems(items: number[]): { regular: number[]; trinket: number | null } {
  let trinket: number | null = null;
  const regular: number[] = [];
  for (const id of items) {
    if (id === 0) continue;
    if (TRINKET_IDS.has(id) && trinket === null) {
      trinket = id;
    } else {
      regular.push(id);
    }
  }
  return { regular, trinket };
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
// Health Bar
// ---------------------------------------------------------------------------

function HealthBar({ current, max }: { current: number; max: number }) {
  const pct = max > 0 ? (current / max) * 100 : 0;
  const dead = current <= 0;
  return (
    <div className="w-full min-w-[40px]">
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            dead ? 'bg-gray-600' : pct > 50 ? 'bg-emerald-500' : pct > 25 ? 'bg-yellow-500' : 'bg-red-500',
          )}
          style={{ width: `${dead ? 0 : pct}%` }}
        />
      </div>
      <p className={cn('text-[9px] text-center mt-0.5 tabular-nums', dead ? 'text-red-400/60' : 'text-muted-foreground/60')}>
        {dead ? 'Dead' : `${Math.round(pct)}%`}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Items Display
// ---------------------------------------------------------------------------

function ItemsDisplay({ items, ddragonVersion }: { items: number[]; ddragonVersion: string }) {
  const { regular, trinket } = separateItems(items);

  return (
    <div className="flex items-center gap-0.5">
      {[...Array(6)].map((_, i) => {
        const itemId = regular[i];
        if (itemId) {
          return (
            <img
              key={i}
              src={itemImgUrl(ddragonVersion, itemId)}
              alt=""
              className="w-6 h-6 rounded-sm bg-secondary"
              loading="lazy"
            />
          );
        }
        return <div key={i} className="w-6 h-6 rounded-sm bg-secondary/40" />;
      })}
      <div className="ml-0.5">
        {trinket ? (
          <img
            src={itemImgUrl(ddragonVersion, trinket)}
            alt=""
            className="w-6 h-6 rounded-full bg-secondary"
            loading="lazy"
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-secondary/30" />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Player Stats Table (full-width)
// ---------------------------------------------------------------------------

function PlayerStatsTable({ players, opponents, ddragonVersion, side, teamCode, teamImage }: {
  players: LivePlayerStats[];
  opponents: LivePlayerStats[];
  ddragonVersion: string;
  side: 'blue' | 'red';
  teamCode: string;
  teamImage?: string;
}) {
  const sideColor = side === 'blue' ? 'text-blue-400' : 'text-red-400';
  const sideBg = side === 'blue' ? 'bg-blue-500' : 'bg-red-500';
  const headerBg = side === 'blue' ? 'bg-blue-500/5' : 'bg-red-500/5';

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Team header */}
      <div className={cn('flex items-center gap-2 px-4 py-2.5', headerBg)}>
        <div className={cn('h-3 w-0.5 rounded-full', sideBg)} />
        {teamImage && <img src={teamImage} alt="" className="h-5 w-5 object-contain" />}
        <span className={cn('text-xs font-bold uppercase tracking-wide', sideColor)}>
          {teamCode}
        </span>
        <span className="text-[10px] text-muted-foreground/50 uppercase">{side} side</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_48px_156px_40px_28px_28px_28px_52px_52px] gap-x-2 items-center px-4 py-1.5 border-b border-border/40">
            <span className="text-[9px] text-muted-foreground/50 uppercase font-medium">Champion</span>
            <span className="text-[9px] text-muted-foreground/50 uppercase font-medium text-center">HP</span>
            <span className="text-[9px] text-muted-foreground/50 uppercase font-medium">Items</span>
            <span className="text-[9px] text-muted-foreground/50 uppercase font-medium text-right">CS</span>
            <span className="text-[9px] text-muted-foreground/50 uppercase font-medium text-right">K</span>
            <span className="text-[9px] text-muted-foreground/50 uppercase font-medium text-right">D</span>
            <span className="text-[9px] text-muted-foreground/50 uppercase font-medium text-right">A</span>
            <span className="text-[9px] text-muted-foreground/50 uppercase font-medium text-right">Gold</span>
            <span className="text-[9px] text-muted-foreground/50 uppercase font-medium text-right">+/-</span>
          </div>

          {/* Player rows */}
          {players.map((player, idx) => {
            const opponent = opponents[idx];
            const goldDiff = opponent ? player.totalGold - opponent.totalGold : 0;
            const goldDiffStr = goldDiff > 0
              ? `+${fmtGold(goldDiff)}`
              : goldDiff < 0 ? `-${fmtGold(Math.abs(goldDiff))}`
              : '-';
            const alive = player.currentHealth > 0;
            const champUrl = champImgUrl(ddragonVersion, player.championKey);
            const roleColor = side === 'blue' ? 'text-blue-400/70' : 'text-red-400/70';
            const roleBg = side === 'blue' ? 'bg-blue-500/10' : 'bg-red-500/10';

            return (
              <div
                key={player.participantId}
                className={cn(
                  'grid grid-cols-[1fr_48px_156px_40px_28px_28px_28px_52px_52px] gap-x-2 items-center px-4 py-2',
                  !alive && 'opacity-40',
                  idx < players.length - 1 && 'border-b border-border/20',
                )}
              >
                {/* Champion */}
                <div className="flex items-center gap-2 min-w-0">
                  <div className="relative shrink-0">
                    {champUrl ? (
                      <img src={champUrl} alt={player.champion} className="w-8 h-8 rounded bg-secondary" loading="lazy" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center text-[9px] text-muted-foreground">
                        {player.champion.charAt(0)}
                      </div>
                    )}
                    <span className="absolute -bottom-0.5 -right-0.5 text-[8px] font-bold bg-background border border-border/50 rounded px-0.5 leading-tight text-muted-foreground">
                      {player.level}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span className={cn('text-[8px] font-bold px-1 py-px rounded', roleBg, roleColor)}>
                        {ROLE_LABELS[player.role] || player.role.toUpperCase()}
                      </span>
                      <span className="text-xs font-semibold text-foreground truncate">
                        {player.champion}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground/50 truncate">{player.summonerName}</p>
                  </div>
                </div>

                {/* HP */}
                <HealthBar current={player.currentHealth} max={player.maxHealth} />

                {/* Items */}
                <ItemsDisplay items={player.items} ddragonVersion={ddragonVersion} />

                {/* CS */}
                <span className="text-xs text-muted-foreground text-right tabular-nums">
                  {player.creepScore}
                </span>

                {/* K / D / A */}
                <span className="text-xs font-semibold text-foreground text-right tabular-nums">
                  {player.kills}
                </span>
                <span className="text-xs font-semibold text-red-400/80 text-right tabular-nums">
                  {player.deaths}
                </span>
                <span className="text-xs font-semibold text-foreground text-right tabular-nums">
                  {player.assists}
                </span>

                {/* Gold */}
                <span className="text-xs font-semibold text-yellow-400/80 text-right tabular-nums" title={fmtGoldFull(player.totalGold)}>
                  {fmtGold(player.totalGold)}
                </span>

                {/* Gold Diff */}
                <span className={cn(
                  'text-xs font-bold text-right tabular-nums',
                  goldDiff > 0 ? 'text-emerald-400' : goldDiff < 0 ? 'text-red-400' : 'text-muted-foreground/30',
                )}>
                  {goldDiffStr}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team Stats Summary (kills, gold, towers, dragons, barons)
// ---------------------------------------------------------------------------

function TeamStatsSummary({ game }: { game: LiveGame }) {
  if (!game.live_stats) return null;
  const s = game.live_stats;
  const totalGold = s.blue_gold + s.red_gold;
  const blueGoldPct = totalGold > 0 ? (s.blue_gold / totalGold) * 100 : 50;
  const goldDiff = s.blue_gold - s.red_gold;

  const stats = [
    { icon: <Skull size={14} className="text-red-400" />, label: 'Kills', blue: s.blue_kills, red: s.red_kills },
    { icon: <Coins size={14} className="text-yellow-400" />, label: 'Gold', blue: fmtGold(s.blue_gold), red: fmtGold(s.red_gold) },
    { icon: <TowerControl size={14} className="text-sky-400" />, label: 'Towers', blue: s.blue_towers, red: s.red_towers },
    { icon: <Flame size={14} className="text-orange-400" />, label: 'Dragons', blue: s.blue_dragons, red: s.red_dragons },
    { icon: <Crown size={14} className="text-purple-400" />, label: 'Barons', blue: s.blue_barons, red: s.red_barons },
  ];

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      {stats.map((s) => (
        <div key={s.label} className="flex items-center justify-between text-sm">
          <span className="font-bold text-blue-400 tabular-nums w-12 text-right">{s.blue}</span>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            {s.icon}
            <span className="text-[10px] uppercase tracking-wider font-medium">{s.label}</span>
          </div>
          <span className="font-bold text-red-400 tabular-nums w-12">{s.red}</span>
        </div>
      ))}

      {/* Gold difference bar */}
      <div className="space-y-1 pt-1">
        <div className="h-2 rounded-full overflow-hidden flex bg-red-500/30">
          <div
            className="h-full bg-blue-500 transition-all duration-700"
            style={{ width: `${blueGoldPct}%` }}
          />
        </div>
        <p className={cn(
          'text-[10px] font-semibold text-center',
          goldDiff > 0 ? 'text-blue-400' : goldDiff < 0 ? 'text-red-400' : 'text-muted-foreground',
        )}>
          {goldDiff > 0 ? `+${fmtGold(goldDiff)} Blue` : goldDiff < 0 ? `+${fmtGold(Math.abs(goldDiff))} Red` : 'Even'}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Win Probability Bar
// ---------------------------------------------------------------------------

function WinProbBar({ blueProb, redProb }: { blueProb: number; redProb: number }) {
  const blueBetter = blueProb > redProb;
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-2">
      <div className="flex justify-between text-sm font-bold">
        <span className={blueBetter ? 'text-blue-400' : 'text-muted-foreground'}>
          {blueProb}%
        </span>
        <span className="text-muted-foreground text-[10px] uppercase tracking-widest self-center">Win Probability</span>
        <span className={!blueBetter ? 'text-red-400' : 'text-muted-foreground'}>
          {redProb}%
        </span>
      </div>
      <div className="h-3 rounded-full overflow-hidden flex bg-secondary">
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

function SeriesTimeline({ games }: { games: SeriesGame[] }) {
  const [expandedGame, setExpandedGame] = useState<number | null>(null);

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-1.5 mb-3">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Serie
        </span>
        <div className="flex-1 h-px bg-border/50" />
      </div>

      <div className="flex items-center gap-2 justify-center">
        {games.map((sg) => {
          const isCompleted = sg.state === 'completed';
          const isCurrent = sg.is_current;
          const isUnstarted = sg.state === 'unstarted';

          return (
            <button
              key={sg.number}
              onClick={() => {
                if (isCompleted && sg.draft) {
                  setExpandedGame(expandedGame === sg.number ? null : sg.number);
                }
              }}
              className={cn(
                'relative flex items-center justify-center w-11 h-11 rounded-lg text-sm font-bold transition-all',
                isCurrent && 'bg-primary/20 text-primary ring-2 ring-primary/50',
                isCompleted && sg.draft && 'bg-secondary hover:bg-secondary/80 text-foreground cursor-pointer',
                isCompleted && !sg.draft && 'bg-secondary/50 text-muted-foreground cursor-default',
                isUnstarted && 'bg-secondary/30 text-muted-foreground/40 cursor-default',
              )}
              disabled={isUnstarted || (isCompleted && !sg.draft)}
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
        if (!sg || !sg.draft) return null;
        return (
          <div className="mt-3 p-3 bg-secondary/20 rounded-lg border border-border/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-muted-foreground">
                Game {sg.number} - Finalizado
              </span>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
                <span className="text-blue-400">{sg.blue_team.code}</span>
                <span>vs</span>
                <span className="text-red-400">{sg.red_team.code}</span>
              </div>
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] gap-x-4 gap-y-0.5 text-[11px]">
              <div className="text-blue-400 font-semibold text-right">{sg.blue_team.code}</div>
              <div />
              <div className="text-red-400 font-semibold">{sg.red_team.code}</div>
              {POSITIONS.map((pos) => (
                <div key={pos} className="contents">
                  <div className="text-right text-foreground/80">{sg.draft![`blue_${pos}` as keyof LiveGameDraft]}</div>
                  <div className="text-muted-foreground/40 text-center font-bold">{ROLE_LABELS[pos]}</div>
                  <div className="text-foreground/80">{sg.draft![`red_${pos}` as keyof LiveGameDraft]}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LiveGameDetailPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const { games, loading, error, lastUpdated, refresh } = useLiveGames();

  const game = games.find(g => g.match_id === matchId);
  const hasPlayers = game?.players && (game.players.blue.length > 0 || game.players.red.length > 0);
  const hasSeries = game?.series_games && game.series_games.length > 1;
  const preds = game?.prediction?.predictions ?? null;

  return (
    <div className="space-y-4">
      {/* Back + Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/live"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft size={14} />
            Ao Vivo
          </Link>
          <div className="h-4 w-px bg-border" />
          {game && (
            <>
              {game.league.image && (
                <img src={game.league.image} alt="" className="h-5 w-5 object-contain opacity-80" />
              )}
              <span className="text-sm font-medium text-muted-foreground">{game.league.name}</span>
              {game.block_name && (
                <span className="text-sm text-muted-foreground/60">{game.block_name}</span>
              )}
              <span className="text-sm text-muted-foreground/60">{boLabel(game.strategy)}</span>
            </>
          )}
          <div className="flex items-center gap-1.5">
            <LiveDot />
            <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Live</span>
          </div>
          {lastUpdated && (
            <span className="text-[10px] text-muted-foreground/50">{timeAgo(lastUpdated)}</span>
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
      {loading && !game && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">Carregando...</span>
        </div>
      )}

      {/* Error / Not found */}
      {error && !loading && !game && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}
      {!loading && !error && !game && (
        <div className="text-center py-20 text-muted-foreground/50">
          <Radio size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-base font-medium">Partida nao encontrada</p>
          <p className="text-sm mt-1">A partida pode ter finalizado.</p>
          <Link to="/live" className="text-primary text-sm mt-3 inline-block hover:underline">
            Voltar para Ao Vivo
          </Link>
        </div>
      )}

      {/* Game Detail */}
      {game && (
        <>
          {/* Teams + Score */}
          <div className="bg-card border border-border rounded-xl px-6 py-5">
            <div className="flex items-center justify-center gap-6">
              {/* Blue */}
              <div className="flex items-center gap-3 flex-1 min-w-0 justify-end">
                <div className="min-w-0 text-right">
                  <p className="text-lg font-bold text-foreground truncate">{game.blue_team.name}</p>
                  <p className="text-[10px] text-blue-400/70 font-semibold uppercase">Blue Side</p>
                </div>
                {game.blue_team.image && (
                  <img src={game.blue_team.image} alt="" className="h-12 w-12 object-contain shrink-0" />
                )}
              </div>

              {/* Score */}
              <div className="flex items-center gap-4 px-2">
                <span className="text-4xl font-black text-foreground tabular-nums">
                  {game.blue_team.result?.gameWins ?? 0}
                </span>
                <span className="text-lg text-muted-foreground/30 font-bold">:</span>
                <span className="text-4xl font-black text-foreground tabular-nums">
                  {game.red_team.result?.gameWins ?? 0}
                </span>
              </div>

              {/* Red */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {game.red_team.image && (
                  <img src={game.red_team.image} alt="" className="h-12 w-12 object-contain shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-lg font-bold text-foreground truncate">{game.red_team.name}</p>
                  <p className="text-[10px] text-red-400/70 font-semibold uppercase">Red Side</p>
                </div>
              </div>
            </div>
          </div>

          {/* Series Timeline */}
          {hasSeries && <SeriesTimeline games={game.series_games!} />}

          {/* Win Probability */}
          {preds && (
            <WinProbBar blueProb={preds.blue_win_prob} redProb={preds.red_win_prob} />
          )}
          {!preds && game.draft && game.prediction?.message && (
            <div className="bg-card border border-border rounded-xl px-4 py-3">
              <p className="text-xs text-muted-foreground text-center">{game.prediction.message}</p>
            </div>
          )}

          {/* Live Stats + Prediction grid */}
          {(game.live_stats || preds) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {game.live_stats && <TeamStatsSummary game={game} />}
              {preds && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Estimativas</p>
                  <div className="grid grid-cols-4 gap-3 text-center">
                    {[
                      { icon: <Skull size={14} className="text-red-400" />, label: 'Kills', value: preds.total_kills },
                      { icon: <TowerControl size={14} className="text-sky-400" />, label: 'Towers', value: preds.total_towers },
                      { icon: <Flame size={14} className="text-orange-400" />, label: 'Dragons', value: preds.total_dragons },
                      { icon: <Crown size={14} className="text-purple-400" />, label: 'Barons', value: preds.total_barons },
                    ].map((s) => (
                      <div key={s.label}>
                        <div className="flex items-center justify-center gap-1 mb-1">{s.icon}</div>
                        <p className="text-lg font-bold text-foreground">{s.value}</p>
                        <p className="text-[9px] text-muted-foreground uppercase">{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* No stats message */}
          {!game.live_stats && !game.stats_enabled && (
            <div className="bg-card border border-border rounded-xl px-4 py-3">
              <p className="text-xs text-muted-foreground/50 text-center">
                Placar ao vivo indisponivel para esta liga
              </p>
            </div>
          )}

          {/* Player tables */}
          {hasPlayers && (
            <div className="space-y-4">
              <PlayerStatsTable
                players={game.players!.blue}
                opponents={game.players!.red}
                ddragonVersion={game.ddragon_version}
                side="blue"
                teamCode={game.blue_team.code}
                teamImage={game.blue_team.image}
              />
              <PlayerStatsTable
                players={game.players!.red}
                opponents={game.players!.blue}
                ddragonVersion={game.ddragon_version}
                side="red"
                teamCode={game.red_team.code}
                teamImage={game.red_team.image}
              />
            </div>
          )}

          {/* No players */}
          {!hasPlayers && game.draft && (
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Draft</p>
              <div className="grid grid-cols-[1fr_auto_1fr] gap-x-6 gap-y-1 text-sm max-w-md mx-auto">
                <div className="text-blue-400 font-semibold text-right">{game.blue_team.code}</div>
                <div />
                <div className="text-red-400 font-semibold">{game.red_team.code}</div>
                {POSITIONS.map((pos) => (
                  <div key={pos} className="contents">
                    <div className="text-right text-foreground">{game.draft![`blue_${pos}` as keyof LiveGameDraft]}</div>
                    <div className="text-muted-foreground/40 text-center font-bold text-xs">{ROLE_LABELS[pos]}</div>
                    <div className="text-foreground">{game.draft![`red_${pos}` as keyof LiveGameDraft]}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!game.draft && (
            <div className="bg-card border border-border rounded-xl px-4 py-3">
              <p className="text-xs text-muted-foreground/50 text-center">Picks indisponiveis</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
