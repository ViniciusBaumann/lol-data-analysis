import { memo } from 'react';
import { cn } from '@/lib/utils';
import { SeriesGame, SeriesGamePlayer, LiveGameDraft } from '@/types';
import { Skull, TowerControl, Flame, Crown, Coins, Castle, Trophy } from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POSITIONS = ['top', 'jng', 'mid', 'bot', 'sup'] as const;
const ROLE_LABELS: Record<string, string> = {
  top: 'TOP',
  jng: 'JNG',
  mid: 'MID',
  bot: 'BOT',
  sup: 'SUP',
};

const TRINKET_IDS = new Set([3340, 3363, 3364]);

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getChampionKey(championName: string): string {
  if (CHAMPION_KEY_MAP[championName]) {
    return CHAMPION_KEY_MAP[championName];
  }
  return championName.replace(/['\s\.]/g, '');
}

function champImgUrl(ver: string, championName: string, championKey?: string): string {
  if (!ver) return '';
  if (championKey) {
    return `https://ddragon.leagueoflegends.com/cdn/${ver}/img/champion/${championKey}.png`;
  }
  if (!championName) return '';
  const key = getChampionKey(championName);
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

function formatGold(gold: number): string {
  if (gold >= 1000) return `${(gold / 1000).toFixed(1)}k`;
  return String(gold);
}

function formatGoldDiff(diff: number): string {
  if (diff > 0) return `+${formatGold(diff)}`;
  if (diff < 0) return `-${formatGold(Math.abs(diff))}`;
  return '0';
}

// ---------------------------------------------------------------------------
// Completed Badge
// ---------------------------------------------------------------------------

function CompletedBadge() {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 bg-zinc-700/50 rounded-md">
      <Trophy size={14} className="text-yellow-500" />
      <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
        Finalizado
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat Item
// ---------------------------------------------------------------------------

function StatItem({
  icon,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  value: number | string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      {icon}
      <span className={cn(
        'text-sm font-bold tabular-nums',
        highlight ? 'text-zinc-100' : 'text-zinc-400'
      )}>
        {value}
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
  oppKills: number;
  oppGold: number;
  oppTowers: number;
  oppDragons: number;
  oppBarons: number;
  side: 'blue' | 'red';
}

function TeamStatsBar({
  kills, gold, towers, dragons, barons, inhibitors,
  oppKills, oppGold, oppTowers, oppDragons, oppBarons,
  side
}: TeamStatsProps) {
  const isBlue = side === 'blue';
  const items = [
    { icon: <Flame size={14} className="text-orange-400" />, value: dragons, better: dragons > oppDragons },
    { icon: <TowerControl size={14} className="text-sky-400" />, value: towers, better: towers > oppTowers },
    { icon: <Castle size={14} className="text-teal-400" />, value: inhibitors, better: inhibitors > 0 },
    { icon: <Crown size={14} className="text-purple-400" />, value: barons, better: barons > oppBarons },
    { icon: <Coins size={14} className="text-yellow-400" />, value: formatGold(gold), better: gold > oppGold },
    { icon: <Skull size={14} className="text-red-400" />, value: kills, better: kills > oppKills },
  ];

  if (!isBlue) items.reverse();

  return (
    <div className={cn('flex items-center gap-4', isBlue ? 'justify-start' : 'justify-end')}>
      {items.map((item, idx) => (
        <StatItem key={idx} icon={item.icon} value={item.value} highlight={item.better} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Player Row (DraftDisplay style)
// ---------------------------------------------------------------------------

interface PlayerRowProps {
  bluePlayer: SeriesGamePlayer | null;
  redPlayer: SeriesGamePlayer | null;
  blueChampion: string;
  redChampion: string;
  position: string;
  ddragonVersion: string;
}

function PlayerRow({ bluePlayer, redPlayer, blueChampion, redChampion, position, ddragonVersion }: PlayerRowProps) {
  const blueImgUrl = bluePlayer
    ? champImgUrl(ddragonVersion, bluePlayer.champion, bluePlayer.championKey)
    : champImgUrl(ddragonVersion, blueChampion);
  const redImgUrl = redPlayer
    ? champImgUrl(ddragonVersion, redPlayer.champion, redPlayer.championKey)
    : champImgUrl(ddragonVersion, redChampion);

  const hasStats = bluePlayer && redPlayer;
  const goldDiff = hasStats ? bluePlayer.totalGold - redPlayer.totalGold : 0;

  return (
    <div className="flex items-center py-2.5 border-b border-zinc-800/50 last:border-0">
      {/* Blue side */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {/* Champion */}
        <div className="relative shrink-0">
          {blueImgUrl ? (
            <img
              src={blueImgUrl}
              alt={bluePlayer?.champion || blueChampion}
              className="w-9 h-9 rounded bg-zinc-800 ring-1 ring-blue-500/40"
              loading="lazy"
            />
          ) : (
            <div className="w-9 h-9 rounded bg-zinc-800 flex items-center justify-center text-xs text-zinc-500 ring-1 ring-blue-500/40">
              ?
            </div>
          )}
          {bluePlayer && (
            <span className="absolute -bottom-0.5 -right-0.5 text-[9px] font-bold bg-blue-600 text-white rounded px-1 leading-tight">
              {bluePlayer.level}
            </span>
          )}
        </div>

        {/* Name */}
        <div className="min-w-0 flex-shrink">
          <p className="text-xs font-semibold text-blue-400 truncate">
            {bluePlayer?.champion || blueChampion}
          </p>
          {bluePlayer?.summonerName && (
            <p className="text-[10px] text-zinc-600 truncate">{bluePlayer.summonerName}</p>
          )}
        </div>

        {/* Items */}
        {bluePlayer && bluePlayer.items.length > 0 && (
          <div className="flex items-center gap-px ml-auto shrink-0">
            {(() => {
              const { regular, trinket } = separateItems(bluePlayer.items);
              return (
                <>
                  {[...Array(6)].map((_, i) => {
                    const itemId = regular[i];
                    if (itemId) {
                      return (
                        <img
                          key={i}
                          src={itemImgUrl(ddragonVersion, itemId)}
                          alt=""
                          className="w-5 h-5 rounded-sm bg-zinc-800"
                          loading="lazy"
                        />
                      );
                    }
                    return <div key={i} className="w-5 h-5 rounded-sm bg-zinc-800/40" />;
                  })}
                  {trinket ? (
                    <img
                      src={itemImgUrl(ddragonVersion, trinket)}
                      alt=""
                      className="w-5 h-5 rounded-full bg-zinc-800 ml-0.5"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-zinc-800/30 ml-0.5" />
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* Stats Center */}
      <div className="flex items-center gap-3 px-3 shrink-0">
        {hasStats ? (
          <>
            {/* Blue stats */}
            <div className="flex items-center gap-2 text-[11px] tabular-nums">
              <span className="text-zinc-400 w-8 text-right">{bluePlayer.creepScore}</span>
              <span className="text-zinc-300 w-14 text-right">
                {bluePlayer.kills}/{bluePlayer.deaths}/{bluePlayer.assists}
              </span>
            </div>

            {/* Position + Gold Diff */}
            <div className="flex flex-col items-center w-14">
              <span className="text-[9px] font-bold text-zinc-600 uppercase">
                {ROLE_LABELS[position] || position}
              </span>
              <span className={cn(
                'text-[10px] font-bold tabular-nums',
                goldDiff > 0 ? 'text-blue-400' : goldDiff < 0 ? 'text-red-400' : 'text-zinc-600'
              )}>
                {formatGoldDiff(goldDiff)}
              </span>
            </div>

            {/* Red stats */}
            <div className="flex items-center gap-2 text-[11px] tabular-nums">
              <span className="text-zinc-300 w-14">
                {redPlayer.kills}/{redPlayer.deaths}/{redPlayer.assists}
              </span>
              <span className="text-zinc-400 w-8">{redPlayer.creepScore}</span>
            </div>
          </>
        ) : (
          <div className="w-14 text-center">
            <span className="text-[10px] font-bold text-zinc-600 uppercase">
              {ROLE_LABELS[position] || position}
            </span>
          </div>
        )}
      </div>

      {/* Red side */}
      <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
        {/* Items */}
        {redPlayer && redPlayer.items.length > 0 && (
          <div className="flex items-center gap-px mr-auto shrink-0">
            {(() => {
              const { regular, trinket } = separateItems(redPlayer.items);
              return (
                <>
                  {trinket ? (
                    <img
                      src={itemImgUrl(ddragonVersion, trinket)}
                      alt=""
                      className="w-5 h-5 rounded-full bg-zinc-800 mr-0.5"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-zinc-800/30 mr-0.5" />
                  )}
                  {[...Array(6)].map((_, i) => {
                    const itemId = regular[i];
                    if (itemId) {
                      return (
                        <img
                          key={i}
                          src={itemImgUrl(ddragonVersion, itemId)}
                          alt=""
                          className="w-5 h-5 rounded-sm bg-zinc-800"
                          loading="lazy"
                        />
                      );
                    }
                    return <div key={i} className="w-5 h-5 rounded-sm bg-zinc-800/40" />;
                  })}
                </>
              );
            })()}
          </div>
        )}

        {/* Name */}
        <div className="min-w-0 flex-shrink text-right">
          <p className="text-xs font-semibold text-red-400 truncate">
            {redPlayer?.champion || redChampion}
          </p>
          {redPlayer?.summonerName && (
            <p className="text-[10px] text-zinc-600 truncate">{redPlayer.summonerName}</p>
          )}
        </div>

        {/* Champion */}
        <div className="relative shrink-0">
          {redImgUrl ? (
            <img
              src={redImgUrl}
              alt={redPlayer?.champion || redChampion}
              className="w-9 h-9 rounded bg-zinc-800 ring-1 ring-red-500/40"
              loading="lazy"
            />
          ) : (
            <div className="w-9 h-9 rounded bg-zinc-800 flex items-center justify-center text-xs text-zinc-500 ring-1 ring-red-500/40">
              ?
            </div>
          )}
          {redPlayer && (
            <span className="absolute -bottom-0.5 -left-0.5 text-[9px] font-bold bg-red-600 text-white rounded px-1 leading-tight">
              {redPlayer.level}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface CompletedGameScoreboardProps {
  game: SeriesGame;
  ddragonVersion: string;
}

function CompletedGameScoreboardComponent({ game, ddragonVersion }: CompletedGameScoreboardProps) {
  const stats = game.final_stats;
  const players = game.players;
  const draft = game.draft;
  const isPandascoreOnly = stats?.source === 'pandascore';
  const hasDetailedStats = !!stats && !isPandascoreOnly;
  const hasStats = !!stats;
  const hasPlayers = players && (players.blue.length > 0 || players.red.length > 0);

  // Determine winner: prefer explicit winner field, fallback to kills comparison
  const winner: 'blue' | 'red' = stats?.winner
    ? (stats.winner.toUpperCase() === game.blue_team.code.toUpperCase() ? 'blue' : 'red')
    : (stats && stats.blue_kills > stats.red_kills ? 'blue' : 'red');

  // Format game duration
  const gameDuration = stats?.game_length
    ? `${Math.floor(stats.game_length / 60)}:${String(stats.game_length % 60).padStart(2, '0')}`
    : null;

  // Map players by role
  const bluePlayers: Record<string, SeriesGamePlayer> = {};
  const redPlayers: Record<string, SeriesGamePlayer> = {};

  if (players) {
    for (const p of players.blue) {
      if (p.role) bluePlayers[p.role] = p;
    }
    for (const p of players.red) {
      if (p.role) redPlayers[p.role] = p;
    }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
        {/* Blue team */}
        <div className="flex items-center gap-3">
          {game.blue_team.image && (
            <img
              src={game.blue_team.image}
              alt={game.blue_team.code}
              className={cn(
                'h-10 w-10 object-contain',
                winner === 'blue' && 'ring-2 ring-yellow-500 rounded-lg'
              )}
            />
          )}
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-blue-400">{game.blue_team.code}</span>
            {winner === 'blue' && <Trophy size={16} className="text-yellow-500" />}
          </div>
        </div>

        {/* Center */}
        <div className="flex flex-col items-center gap-1">
          <CompletedBadge />
          <span className="text-xs font-medium text-zinc-500">Game {game.number}</span>
        </div>

        {/* Red team */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {winner === 'red' && <Trophy size={16} className="text-yellow-500" />}
            <span className="text-base font-bold text-red-400">{game.red_team.code}</span>
          </div>
          {game.red_team.image && (
            <img
              src={game.red_team.image}
              alt={game.red_team.code}
              className={cn(
                'h-10 w-10 object-contain',
                winner === 'red' && 'ring-2 ring-yellow-500 rounded-lg'
              )}
            />
          )}
        </div>
      </div>

      {/* PandaScore minimal info (winner + duration, no detailed stats) */}
      {isPandascoreOnly && (
        <div className="px-4 py-4 text-center border-b border-zinc-800">
          <div className="flex items-center justify-center gap-3">
            <Trophy size={18} className="text-yellow-500" />
            <span className="text-sm font-bold text-zinc-200">
              {winner === 'blue' ? game.blue_team.code : game.red_team.code} venceu
            </span>
            {gameDuration && (
              <span className="text-xs text-zinc-500">({gameDuration})</span>
            )}
          </div>
          <p className="text-[10px] text-zinc-600 mt-1">
            Estatisticas detalhadas indisponiveis
          </p>
        </div>
      )}

      {/* Team Stats Bar */}
      {hasDetailedStats && (
        <div className="flex items-center justify-between px-4 py-3 bg-zinc-800/30 border-b border-zinc-800">
          <TeamStatsBar
            kills={stats.blue_kills}
            gold={stats.blue_gold}
            towers={stats.blue_towers}
            dragons={stats.blue_dragons}
            barons={stats.blue_barons}
            inhibitors={stats.blue_inhibitors}
            oppKills={stats.red_kills}
            oppGold={stats.red_gold}
            oppTowers={stats.red_towers}
            oppDragons={stats.red_dragons}
            oppBarons={stats.red_barons}
            side="blue"
          />
          <TeamStatsBar
            kills={stats.red_kills}
            gold={stats.red_gold}
            towers={stats.red_towers}
            dragons={stats.red_dragons}
            barons={stats.red_barons}
            inhibitors={stats.red_inhibitors}
            oppKills={stats.blue_kills}
            oppGold={stats.blue_gold}
            oppTowers={stats.blue_towers}
            oppDragons={stats.blue_dragons}
            oppBarons={stats.blue_barons}
            side="red"
          />
        </div>
      )}

      {/* Column headers */}
      {hasPlayers && (
        <div className="flex items-center px-4 py-1.5 border-b border-zinc-800/50 bg-zinc-900/30">
          <div className="flex-1 flex items-center gap-2">
            <span className="text-[9px] font-semibold text-zinc-600 uppercase">Champion</span>
            <span className="ml-auto text-[9px] font-semibold text-zinc-600 uppercase">Items</span>
          </div>
          <div className="flex items-center gap-3 px-3">
            <span className="text-[9px] font-semibold text-zinc-600 uppercase w-8 text-right">CS</span>
            <span className="text-[9px] font-semibold text-zinc-600 uppercase w-14 text-right">KDA</span>
            <span className="text-[9px] font-semibold text-zinc-600 uppercase w-14 text-center">+/-</span>
            <span className="text-[9px] font-semibold text-zinc-600 uppercase w-14">KDA</span>
            <span className="text-[9px] font-semibold text-zinc-600 uppercase w-8">CS</span>
          </div>
          <div className="flex-1 flex items-center gap-2">
            <span className="text-[9px] font-semibold text-zinc-600 uppercase">Items</span>
            <span className="ml-auto text-[9px] font-semibold text-zinc-600 uppercase">Champion</span>
          </div>
        </div>
      )}

      {/* Player rows */}
      {(hasPlayers || draft) && (
        <div className="px-4 py-1">
          {POSITIONS.map((pos) => (
            <PlayerRow
              key={pos}
              position={pos}
              bluePlayer={bluePlayers[pos] || null}
              redPlayer={redPlayers[pos] || null}
              blueChampion={draft?.[`blue_${pos}` as keyof LiveGameDraft] as string || '?'}
              redChampion={draft?.[`red_${pos}` as keyof LiveGameDraft] as string || '?'}
              ddragonVersion={ddragonVersion}
            />
          ))}
        </div>
      )}

      {/* No data fallback */}
      {!hasPlayers && !draft && !hasStats && !isPandascoreOnly && (
        <div className="px-6 py-8 text-center">
          <p className="text-sm text-zinc-500">
            Dados do jogo nao disponiveis.
          </p>
        </div>
      )}
    </div>
  );
}

export const CompletedGameScoreboard = memo(CompletedGameScoreboardComponent);
export default CompletedGameScoreboard;
