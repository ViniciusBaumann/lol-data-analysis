import { cn } from '@/lib/utils';
import { SeriesGame, SeriesGamePlayer, LiveGameDraft } from '@/types';
import { Skull, TowerControl, Flame, Crown, Coins, Castle } from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TRINKET_IDS = new Set([3340, 3363, 3364]);
const POSITIONS = ['top', 'jng', 'mid', 'bot', 'sup'] as const;
const ROLE_LABELS: Record<string, string> = {
  top: 'TOP',
  jng: 'JNG',
  mid: 'MID',
  bot: 'BOT',
  sup: 'SUP',
};

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

function fmtGold(gold: number): string {
  if (gold >= 1000) return `${(gold / 1000).toFixed(1)}k`;
  return String(gold);
}

// ---------------------------------------------------------------------------
// Stat Row
// ---------------------------------------------------------------------------

function StatRow({
  icon,
  label,
  blueValue,
  redValue,
}: {
  icon: React.ReactNode;
  label: string;
  blueValue: number | string;
  redValue: number | string;
}) {
  const blueNum = typeof blueValue === 'number' ? blueValue : 0;
  const redNum = typeof redValue === 'number' ? redValue : 0;
  const blueHigher = blueNum > redNum;
  const redHigher = redNum > blueNum;

  return (
    <div className="flex items-center justify-between text-xs">
      <span
        className={cn(
          'font-bold tabular-nums w-10 text-right',
          blueHigher ? 'text-blue-400' : 'text-zinc-400',
        )}
      >
        {blueValue}
      </span>
      <div className="flex items-center gap-1.5 text-zinc-500">
        {icon}
        <span className="text-[10px] uppercase tracking-wide">{label}</span>
      </div>
      <span
        className={cn(
          'font-bold tabular-nums w-10',
          redHigher ? 'text-red-400' : 'text-zinc-400',
        )}
      >
        {redValue}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Player Row (Compact)
// ---------------------------------------------------------------------------

interface CompactPlayerRowProps {
  player: SeriesGamePlayer;
  ddragonVersion: string;
  side: 'blue' | 'red';
}

function CompactPlayerRow({ player, ddragonVersion, side }: CompactPlayerRowProps) {
  const champUrl = champImgUrl(ddragonVersion, player.championKey);
  const { regular, trinket } = separateItems(player.items);

  return (
    <div className="flex items-center gap-2 py-1.5">
      {/* Champion image */}
      <div className="relative shrink-0">
        {champUrl ? (
          <img
            src={champUrl}
            alt={player.champion}
            className="w-8 h-8 rounded bg-zinc-800 ring-1 ring-zinc-700"
            loading="lazy"
          />
        ) : (
          <div className="w-8 h-8 rounded bg-zinc-800 flex items-center justify-center text-[9px] text-zinc-500">
            {player.champion.charAt(0)}
          </div>
        )}
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 text-[8px] font-bold rounded px-0.5 leading-tight',
            side === 'blue' ? 'bg-blue-600 text-white' : 'bg-red-600 text-white',
          )}
        >
          {player.level}
        </span>
      </div>

      {/* Champion name + KDA */}
      <div className="min-w-0 flex-1">
        <p className={cn('text-[11px] font-semibold truncate', side === 'blue' ? 'text-blue-400' : 'text-red-400')}>
          {player.champion}
        </p>
        <p className="text-[10px] text-zinc-500 tabular-nums">
          {player.kills}/{player.deaths}/{player.assists}
        </p>
      </div>

      {/* CS + Gold */}
      <div className="text-right shrink-0 mr-2">
        <p className="text-[10px] text-zinc-500 tabular-nums">{player.creepScore} CS</p>
        <p className="text-[10px] text-yellow-500/80 tabular-nums">{fmtGold(player.totalGold)}</p>
      </div>

      {/* Items */}
      <div className="flex items-center gap-px shrink-0">
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
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface CompletedGameSummaryProps {
  game: SeriesGame;
  ddragonVersion: string;
}

export function CompletedGameSummary({ game, ddragonVersion }: CompletedGameSummaryProps) {
  const fs = game.final_stats;
  const hasPlayers = game.players && (game.players.blue.length > 0 || game.players.red.length > 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-400">
          Game {game.number} - Finalizado
        </span>
        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
          <span className="text-blue-400 font-medium">{game.blue_team.code}</span>
          <span>vs</span>
          <span className="text-red-400 font-medium">{game.red_team.code}</span>
        </div>
      </div>

      {/* Final Stats Summary */}
      {fs && (
        <div className="bg-zinc-900/50 rounded-lg p-3 space-y-1.5">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
            Resumo
          </p>
          <StatRow
            icon={<Skull size={12} className="text-red-400" />}
            label="Kills"
            blueValue={fs.blue_kills}
            redValue={fs.red_kills}
          />
          <StatRow
            icon={<Coins size={12} className="text-yellow-400" />}
            label="Gold"
            blueValue={fmtGold(fs.blue_gold)}
            redValue={fmtGold(fs.red_gold)}
          />
          <StatRow
            icon={<TowerControl size={12} className="text-sky-400" />}
            label="Torres"
            blueValue={fs.blue_towers}
            redValue={fs.red_towers}
          />
          <StatRow
            icon={<Castle size={12} className="text-teal-400" />}
            label="Inibs"
            blueValue={fs.blue_inhibitors}
            redValue={fs.red_inhibitors}
          />
          <StatRow
            icon={<Flame size={12} className="text-orange-400" />}
            label="Drags"
            blueValue={fs.blue_dragons}
            redValue={fs.red_dragons}
          />
          <StatRow
            icon={<Crown size={12} className="text-purple-400" />}
            label="Barons"
            blueValue={fs.blue_barons}
            redValue={fs.red_barons}
          />
        </div>
      )}

      {/* Players */}
      {hasPlayers && (
        <div className="space-y-3">
          {/* Blue team */}
          <div>
            <p className="text-[10px] font-bold text-blue-400 uppercase mb-1.5 flex items-center gap-1.5">
              {game.blue_team.image && (
                <img src={game.blue_team.image} alt="" className="h-3.5 w-3.5 object-contain" />
              )}
              {game.blue_team.code}
            </p>
            <div className="space-y-0">
              {game.players!.blue.map((player) => (
                <CompactPlayerRow
                  key={player.participantId}
                  player={player}
                  ddragonVersion={ddragonVersion}
                  side="blue"
                />
              ))}
            </div>
          </div>

          {/* Red team */}
          <div>
            <p className="text-[10px] font-bold text-red-400 uppercase mb-1.5 flex items-center gap-1.5">
              {game.red_team.image && (
                <img src={game.red_team.image} alt="" className="h-3.5 w-3.5 object-contain" />
              )}
              {game.red_team.code}
            </p>
            <div className="space-y-0">
              {game.players!.red.map((player) => (
                <CompactPlayerRow
                  key={player.participantId}
                  player={player}
                  ddragonVersion={ddragonVersion}
                  side="red"
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Draft fallback (no player data) */}
      {!hasPlayers && game.draft && (
        <div>
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
            Draft
          </p>
          <div className="grid grid-cols-[1fr_auto_1fr] gap-x-4 gap-y-0.5 text-[11px]">
            <div className="text-blue-400 font-semibold text-right">{game.blue_team.code}</div>
            <div />
            <div className="text-red-400 font-semibold">{game.red_team.code}</div>
            {POSITIONS.map((pos) => (
              <div key={pos} className="contents">
                <div className="text-right text-zinc-300">
                  {game.draft![`blue_${pos}` as keyof LiveGameDraft]}
                </div>
                <div className="text-zinc-600 text-center font-bold">{ROLE_LABELS[pos]}</div>
                <div className="text-zinc-300">
                  {game.draft![`red_${pos}` as keyof LiveGameDraft]}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default CompletedGameSummary;
