import { cn } from '@/lib/utils';
import { LiveGame, LivePlayerStats } from '@/types';
import { Skull, TowerControl, Flame, Crown, Coins, Swords } from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRINKET_IDS = new Set([3340, 3363, 3364]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function formatGameTime(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Live Badge
// ---------------------------------------------------------------------------

function LiveBadge({ statsDisabled }: { statsDisabled?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 rounded-md">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
          In Game
        </span>
      </div>
      {statsDisabled && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/15 rounded-md border border-amber-500/30">
          <span className="text-[10px] font-medium text-amber-400">
            Placar ao vivo desativado nesta liga
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Health Bar
// ---------------------------------------------------------------------------

export function HealthBar({ current, max }: { current: number; max: number }) {
  const pct = max > 0 ? (current / max) * 100 : 0;
  const dead = current <= 0;

  return (
    <div className="relative h-5 rounded bg-zinc-800 overflow-hidden min-w-[140px]">
      <div
        className={cn(
          'h-full transition-all duration-300',
          dead
            ? 'bg-zinc-700'
            : pct > 50
            ? 'bg-gradient-to-r from-emerald-600 to-emerald-500'
            : pct > 25
            ? 'bg-gradient-to-r from-yellow-600 to-yellow-500'
            : 'bg-gradient-to-r from-red-600 to-red-500',
        )}
        style={{ width: `${dead ? 0 : pct}%` }}
      />
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-white/90 tabular-nums drop-shadow">
        {dead ? '0' : current.toLocaleString()}/{max.toLocaleString()}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat Icon
// ---------------------------------------------------------------------------

function StatItem({
  icon,
  value,
  className,
}: {
  icon: React.ReactNode;
  value: number | string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {icon}
      <span className="text-sm font-bold tabular-nums text-zinc-100">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Player Row
// ---------------------------------------------------------------------------

interface PlayerRowProps {
  player: LivePlayerStats;
  goldDiff: number;
  ddragonVersion: string;
  side: 'blue' | 'red';
  isLast: boolean;
}

export function PlayerRow({ player, goldDiff, ddragonVersion, side, isLast }: PlayerRowProps) {
  const alive = player.currentHealth > 0;
  const champUrl = champImgUrl(ddragonVersion, player.championKey);
  const { regular, trinket } = separateItems(player.items);
  const goldDiffStr =
    goldDiff > 0
      ? `+${goldDiff.toLocaleString()}`
      : goldDiff < 0
      ? goldDiff.toLocaleString()
      : '-';

  return (
    <div
      className={cn(
        'grid grid-cols-[160px_150px_180px_55px_35px_35px_35px_75px_70px] gap-x-3 items-center px-4 py-2.5 transition-colors',
        !alive && 'opacity-40',
        !isLast && 'border-b border-zinc-800/50',
        'hover:bg-zinc-800/30',
      )}
    >
      {/* Champion + Name */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="relative shrink-0">
          {champUrl ? (
            <img
              src={champUrl}
              alt={player.champion}
              className="w-10 h-10 rounded-lg bg-zinc-800 ring-1 ring-zinc-700"
              loading="lazy"
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-xs text-zinc-500">
              {player.champion.charAt(0)}
            </div>
          )}
          <span
            className={cn(
              'absolute -bottom-1 -left-1 text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center ring-2 ring-zinc-900',
              side === 'blue' ? 'bg-blue-600 text-white' : 'bg-red-600 text-white',
            )}
          >
            {player.level}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn('text-sm font-semibold truncate', side === 'blue' ? 'text-blue-400' : 'text-red-400')}>
            {player.champion}
          </p>
          <p className="text-[11px] text-zinc-500 truncate">{player.summonerName}</p>
        </div>
      </div>

      {/* Health */}
      <HealthBar current={player.currentHealth} max={player.maxHealth} />

      {/* Items */}
      <div className="flex items-center gap-0.5">
        {[...Array(6)].map((_, i) => {
          const itemId = regular[i];
          if (itemId) {
            return (
              <img
                key={i}
                src={itemImgUrl(ddragonVersion, itemId)}
                alt=""
                className="w-7 h-7 rounded bg-zinc-800 ring-1 ring-zinc-700"
                loading="lazy"
              />
            );
          }
          return <div key={i} className="w-7 h-7 rounded bg-zinc-800/50" />;
        })}
        {trinket ? (
          <img
            src={itemImgUrl(ddragonVersion, trinket)}
            alt=""
            className="w-7 h-7 rounded-full bg-zinc-800 ring-1 ring-zinc-700 ml-1"
            loading="lazy"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-zinc-800/30 ml-1" />
        )}
      </div>

      {/* CS */}
      <span className="text-sm text-zinc-400 text-center tabular-nums font-medium">
        {player.creepScore}
      </span>

      {/* K / D / A */}
      <span className="text-sm font-bold text-zinc-100 text-center tabular-nums">
        {player.kills}
      </span>
      <span className="text-sm font-bold text-red-400 text-center tabular-nums">
        {player.deaths}
      </span>
      <span className="text-sm font-bold text-zinc-100 text-center tabular-nums">
        {player.assists}
      </span>

      {/* Gold */}
      <span className="text-sm font-semibold text-zinc-200 text-right tabular-nums">
        {player.totalGold.toLocaleString()}
      </span>

      {/* Gold Diff */}
      <span
        className={cn(
          'text-sm font-bold text-right tabular-nums',
          goldDiff > 0 ? 'text-emerald-400' : goldDiff < 0 ? 'text-red-400' : 'text-zinc-600',
        )}
      >
        {goldDiffStr}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team Stats Bar
// ---------------------------------------------------------------------------

interface TeamStatsProps {
  kills: number;
  gold: number;
  towers: number;
  dragons: number;
  barons: number;
  inhibitors: number;
  side: 'blue' | 'red';
}

function TeamStatsBar({ kills, gold, towers, dragons, barons, inhibitors, side }: TeamStatsProps) {
  const isBlue = side === 'blue';
  const items = isBlue
    ? [
        { icon: <Flame size={16} className="text-orange-400" />, value: dragons },
        { icon: <TowerControl size={16} className="text-sky-400" />, value: towers },
        { icon: <Crown size={16} className="text-purple-400" />, value: barons },
        { icon: <Coins size={16} className="text-yellow-400" />, value: gold.toLocaleString() },
        { icon: <Swords size={16} className="text-red-400" />, value: kills },
      ]
    : [
        { icon: <Swords size={16} className="text-red-400" />, value: kills },
        { icon: <Coins size={16} className="text-yellow-400" />, value: gold.toLocaleString() },
        { icon: <Crown size={16} className="text-purple-400" />, value: barons },
        { icon: <TowerControl size={16} className="text-sky-400" />, value: towers },
        { icon: <Flame size={16} className="text-orange-400" />, value: dragons },
      ];

  return (
    <div className={cn('flex items-center gap-5', isBlue ? 'justify-start' : 'justify-end')}>
      {items.map((item, idx) => (
        <StatItem key={idx} icon={item.icon} value={item.value} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column Headers
// ---------------------------------------------------------------------------

function ColumnHeaders() {
  return (
    <div className="grid grid-cols-[160px_150px_180px_55px_35px_35px_35px_75px_70px] gap-x-3 items-center px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
      <span className="text-[10px] text-zinc-500 uppercase font-medium tracking-wider" />
      <span className="text-[10px] text-zinc-500 uppercase font-medium tracking-wider">Health</span>
      <span className="text-[10px] text-zinc-500 uppercase font-medium tracking-wider">Items</span>
      <span className="text-[10px] text-zinc-500 uppercase font-medium tracking-wider text-center">CS</span>
      <span className="text-[10px] text-zinc-500 uppercase font-medium tracking-wider text-center">K</span>
      <span className="text-[10px] text-zinc-500 uppercase font-medium tracking-wider text-center">D</span>
      <span className="text-[10px] text-zinc-500 uppercase font-medium tracking-wider text-center">A</span>
      <span className="text-[10px] text-zinc-500 uppercase font-medium tracking-wider text-right">Gold</span>
      <span className="text-[10px] text-zinc-500 uppercase font-medium tracking-wider text-right">+/-</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team Header
// ---------------------------------------------------------------------------

function TeamHeader({
  teamImage,
  teamCode,
  side,
}: {
  teamImage?: string;
  teamCode: string;
  side: 'blue' | 'red';
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-4 py-2',
        side === 'blue' ? 'bg-blue-500/10 border-l-2 border-blue-500' : 'bg-red-500/10 border-l-2 border-red-500',
      )}
    >
      {teamImage && <img src={teamImage} alt="" className="h-5 w-5 object-contain" />}
      <span className={cn('text-xs font-bold uppercase tracking-wide', side === 'blue' ? 'text-blue-400' : 'text-red-400')}>
        {teamCode}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Scoreboard Component
// ---------------------------------------------------------------------------

interface GameScoreboardProps {
  game: LiveGame;
  ddragonVersion: string;
}

export function GameScoreboard({ game, ddragonVersion }: GameScoreboardProps) {
  const stats = game.live_stats;
  const players = game.players;
  const hasStats = !!stats;
  const hasPlayers = players && (players.blue.length > 0 || players.red.length > 0);

  // Stats are disabled if the game is live but API doesn't return player/stats data
  const statsDisabled = !hasStats && !hasPlayers;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Header: Teams + IN GAME badge + Time */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800">
        {/* Blue team */}
        <div className="flex items-center gap-4">
          {game.blue_team.image && (
            <img
              src={game.blue_team.image}
              alt={game.blue_team.code}
              className="h-14 w-14 object-contain drop-shadow-lg"
            />
          )}
          <span className="text-xl font-bold text-zinc-100">{game.blue_team.code}</span>
        </div>

        {/* Center: IN GAME + Time */}
        <div className="flex flex-col items-center gap-1.5">
          <LiveBadge statsDisabled={statsDisabled} />
          {!statsDisabled && (
            <span className="text-2xl font-bold text-zinc-100 tabular-nums tracking-tight">
              {formatGameTime(stats?.game_time_sec)}
            </span>
          )}
        </div>

        {/* Red team */}
        <div className="flex items-center gap-4">
          <span className="text-xl font-bold text-zinc-100">{game.red_team.code}</span>
          {game.red_team.image && (
            <img
              src={game.red_team.image}
              alt={game.red_team.code}
              className="h-14 w-14 object-contain drop-shadow-lg"
            />
          )}
        </div>
      </div>

      {/* Stats bar */}
      {hasStats && (() => {
        const goldDiff = stats.blue_gold - stats.red_gold;
        const absGoldDiff = Math.abs(goldDiff);
        return (
          <div className="flex items-center justify-between px-6 py-3 bg-zinc-900/80 border-b border-zinc-800">
            <TeamStatsBar
              kills={stats.blue_kills}
              gold={stats.blue_gold}
              towers={stats.blue_towers}
              dragons={stats.blue_dragons}
              barons={stats.blue_barons}
              inhibitors={stats.blue_inhibitors}
              side="blue"
            />
            {/* Gold Diff center */}
            <div className="flex flex-col items-center px-3 shrink-0">
              <Coins size={14} className="text-yellow-500 mb-0.5" />
              <span
                className={cn(
                  'text-sm font-bold tabular-nums whitespace-nowrap',
                  goldDiff > 0 ? 'text-blue-400' : goldDiff < 0 ? 'text-red-400' : 'text-zinc-500',
                )}
              >
                {goldDiff > 0 ? `+${absGoldDiff.toLocaleString()}` : goldDiff < 0 ? `-${absGoldDiff.toLocaleString()}` : '0'}
              </span>
            </div>
            <TeamStatsBar
              kills={stats.red_kills}
              gold={stats.red_gold}
              towers={stats.red_towers}
              dragons={stats.red_dragons}
              barons={stats.red_barons}
              inhibitors={stats.red_inhibitors}
              side="red"
            />
          </div>
        );
      })()}

      {/* Player table */}
      {hasPlayers && (
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <ColumnHeaders />

            {/* Blue team */}
            <TeamHeader teamImage={game.blue_team.image} teamCode={game.blue_team.code} side="blue" />
            {players.blue.map((player, idx) => {
              const opponent = players.red[idx];
              const goldDiff = opponent ? player.totalGold - opponent.totalGold : 0;
              return (
                <PlayerRow
                  key={player.participantId}
                  player={player}
                  goldDiff={goldDiff}
                  ddragonVersion={ddragonVersion}
                  side="blue"
                  isLast={idx === players.blue.length - 1}
                />
              );
            })}

            {/* Red team */}
            <TeamHeader teamImage={game.red_team.image} teamCode={game.red_team.code} side="red" />
            {players.red.map((player, idx) => {
              const opponent = players.blue[idx];
              const goldDiff = opponent ? player.totalGold - opponent.totalGold : 0;
              return (
                <PlayerRow
                  key={player.participantId}
                  player={player}
                  goldDiff={goldDiff}
                  ddragonVersion={ddragonVersion}
                  side="red"
                  isLast={idx === players.red.length - 1}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* No player data fallback */}
      {!hasPlayers && (
        <div className="px-6 py-8 text-center">
          <p className="text-sm text-zinc-500">
            {statsDisabled
              ? 'A API da Riot não disponibiliza dados ao vivo para esta liga.'
              : 'Aguardando dados dos jogadores...'}
          </p>
        </div>
      )}
    </div>
  );
}

export default GameScoreboard;
