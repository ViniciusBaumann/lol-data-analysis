import { cn } from '@/lib/utils';
import { LiveGame, LiveGameDraft, LivePlayerStats } from '@/types';

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

// Champion key mappings for special cases
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

function formatGameTime(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
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
// Live Badge
// ---------------------------------------------------------------------------

function LiveBadge() {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 rounded-md">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
      </span>
      <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
        In Game
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Player Row with Stats
// ---------------------------------------------------------------------------

interface PlayerRowProps {
  bluePlayer: LivePlayerStats | null;
  redPlayer: LivePlayerStats | null;
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

interface DraftDisplayProps {
  game: LiveGame;
  ddragonVersion: string;
}

export function DraftDisplay({ game, ddragonVersion }: DraftDisplayProps) {
  const draft = game.draft;
  const players = game.players;
  const liveStats = game.live_stats;

  if (!draft) return null;

  // Map players by role
  const bluePlayers: Record<string, LivePlayerStats> = {};
  const redPlayers: Record<string, LivePlayerStats> = {};

  if (players) {
    for (const p of players.blue) {
      if (p.role) bluePlayers[p.role] = p;
    }
    for (const p of players.red) {
      if (p.role) redPlayers[p.role] = p;
    }
  }

  const hasPlayerData = players && (players.blue.length > 0 || players.red.length > 0);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Header with game time */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
        {/* Blue team */}
        <div className="flex items-center gap-2">
          {game.blue_team.image && (
            <img
              src={game.blue_team.image}
              alt={game.blue_team.code}
              className="h-7 w-7 object-contain"
            />
          )}
          <span className="text-sm font-bold text-blue-400">{game.blue_team.code}</span>
        </div>

        {/* Center: Live badge + Game time */}
        <div className="flex flex-col items-center gap-1">
          <LiveBadge />
          {liveStats?.game_time_sec != null && liveStats.game_time_sec > 0 && (
            <span className="text-sm font-mono font-bold text-zinc-300">
              {formatGameTime(liveStats.game_time_sec)}
            </span>
          )}
        </div>

        {/* Red team */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-red-400">{game.red_team.code}</span>
          {game.red_team.image && (
            <img
              src={game.red_team.image}
              alt={game.red_team.code}
              className="h-7 w-7 object-contain"
            />
          )}
        </div>
      </div>

      {/* Column headers when we have player data */}
      {hasPlayerData && (
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
      <div className="px-4 py-1">
        {POSITIONS.map((pos) => (
          <PlayerRow
            key={pos}
            position={pos}
            bluePlayer={bluePlayers[pos] || null}
            redPlayer={redPlayers[pos] || null}
            blueChampion={draft[`blue_${pos}` as keyof LiveGameDraft] as string}
            redChampion={draft[`red_${pos}` as keyof LiveGameDraft] as string}
            ddragonVersion={ddragonVersion}
          />
        ))}
      </div>
    </div>
  );
}

export default DraftDisplay;
