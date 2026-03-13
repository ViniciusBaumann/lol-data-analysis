import { memo } from 'react';
import { cn } from '@/lib/utils';
import { SeriesGame, SeriesGamePlayer, LiveGameDraft, SavedPrediction, SeriesGameStats, CompositionScores } from '@/types';
import { Skull, TowerControl, Flame, Crown, Coins, Castle, Trophy, Target, Clock, CheckCircle, XCircle, Swords, ArrowRight } from 'lucide-react';

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
      <span className="text-xs font-bold text-zinc-300">
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
    <div className={cn('flex items-center gap-2 sm:gap-4', isBlue ? 'justify-start' : 'justify-end')}>
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
// Prediction vs Result
// ---------------------------------------------------------------------------

const COMP_LABELS: Record<string, string> = {
  early_game: 'Early',
  scaling: 'Scaling',
  teamfight: 'Teamfight',
  splitpush: 'Split',
  poke: 'Poke',
  engage: 'Engage',
  pick: 'Pick',
  siege: 'Siege',
};

function formatTime(minutes: number): string {
  const m = Math.floor(minutes);
  const s = Math.round((minutes - m) * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function PredictionVsResult({
  savedPrediction,
  stats,
  winner,
  blueCode,
  redCode,
  gameDuration,
}: {
  savedPrediction: SavedPrediction;
  stats: SeriesGameStats;
  winner: 'blue' | 'red';
  blueCode: string;
  redCode: string;
  gameDuration: number | null | undefined;
}) {
  const preds = savedPrediction.predictions;
  const matchPred = savedPrediction.match_prediction;
  const comp = savedPrediction.composition;

  // Win probabilities
  const blueWinProb = preds?.blue_win_prob ?? matchPred?.blue_win_prob ?? null;
  const redWinProb = preds?.red_win_prob ?? matchPred?.red_win_prob ?? null;
  const predictedWinner = blueWinProb != null && redWinProb != null
    ? (blueWinProb >= redWinProb ? 'blue' : 'red')
    : null;
  const gotItRight = predictedWinner === winner;

  // Actual totals
  const totalKills = stats.blue_kills + stats.red_kills;
  const totalTowers = stats.blue_towers + stats.red_towers;
  const totalDragons = stats.blue_dragons + stats.red_dragons;
  const totalBarons = stats.blue_barons + stats.red_barons;
  const actualTimeMin = gameDuration ? gameDuration / 60 : null;

  // Objective rows
  const objectives: {
    icon: React.ReactNode;
    label: string;
    predicted: number | null;
    actual: number;
    range?: [number, number];
  }[] = [];

  if (preds) {
    objectives.push(
      {
        icon: <Skull size={13} className="text-red-400" />,
        label: 'Kills',
        predicted: preds.total_kills,
        actual: totalKills,
        range: preds.kills_range,
      },
      {
        icon: <TowerControl size={13} className="text-sky-400" />,
        label: 'Torres',
        predicted: preds.total_towers,
        actual: totalTowers,
        range: preds.towers_range,
      },
      {
        icon: <Flame size={13} className="text-orange-400" />,
        label: 'Dragoes',
        predicted: preds.total_dragons,
        actual: totalDragons,
        range: preds.dragons_range,
      },
      {
        icon: <Crown size={13} className="text-purple-400" />,
        label: 'Baroes',
        predicted: preds.total_barons,
        actual: totalBarons,
        range: preds.barons_range,
      },
    );
  }

  const predictedTime = matchPred?.game_time ?? null;
  const timeRange = matchPred?.game_time_range;

  // Composition analysis
  const getCompEntries = (scores: CompositionScores | null | undefined) => {
    if (!scores) return [];
    return (Object.entries(COMP_LABELS) as [keyof typeof COMP_LABELS, string][])
      .map(([key, label]) => ({ key, label, value: (scores as unknown as Record<string, number>)[key] ?? 0 }))
      .sort((a, b) => b.value - a.value);
  };
  const blueComp = comp ? getCompEntries(comp.blue) : [];
  const redComp = comp ? getCompEntries(comp.red) : [];

  // Count how many objective predictions were in range
  const inRangeCount = objectives.filter(o => {
    if (o.predicted == null) return false;
    if (o.range) return o.actual >= o.range[0] && o.actual <= o.range[1];
    return Math.abs(o.actual - o.predicted) <= 2;
  }).length;
  const totalPredicted = objectives.filter(o => o.predicted != null).length;

  return (
    <div className="border-t border-zinc-800">
      {/* Section header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-800/30">
        <div className="flex items-center gap-2">
          <Target size={14} className="text-violet-400" />
          <span className="text-xs font-bold text-zinc-300">
            Previsao vs Resultado
          </span>
        </div>
        {totalPredicted > 0 && (
          <span className="text-[10px] text-zinc-500">
            {inRangeCount}/{totalPredicted} dentro do range
          </span>
        )}
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* ── Win Prediction ── */}
        {blueWinProb != null && redWinProb != null && (
          <div className="bg-zinc-800/40 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-zinc-500 uppercase font-semibold">Previsao de Vitoria</span>
              {predictedWinner && (
                gotItRight ? (
                  <div className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/15 border border-emerald-500/30 rounded">
                    <CheckCircle size={11} className="text-emerald-400" />
                    <span className="text-[10px] font-bold text-emerald-400">Acertou</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 px-2 py-0.5 bg-red-500/15 border border-red-500/30 rounded">
                    <XCircle size={11} className="text-red-400" />
                    <span className="text-[10px] font-bold text-red-400">Errou</span>
                  </div>
                )
              )}
            </div>
            {/* Probability bar */}
            <div className="flex items-center gap-2 mb-1.5">
              <span className={cn(
                'text-sm font-black tabular-nums w-14 text-right',
                winner === 'blue' ? 'text-blue-400' : 'text-blue-400/60',
              )}>
                {blueWinProb.toFixed(1)}%
              </span>
              <div className="flex-1 h-3 rounded-full overflow-hidden flex bg-zinc-700">
                <div
                  className={cn(
                    'h-full transition-all duration-300',
                    winner === 'blue'
                      ? 'bg-blue-500'
                      : 'bg-blue-500/40',
                  )}
                  style={{ width: `${blueWinProb}%` }}
                />
                <div
                  className={cn(
                    'h-full transition-all duration-300',
                    winner === 'red'
                      ? 'bg-red-500'
                      : 'bg-red-500/40',
                  )}
                  style={{ width: `${redWinProb}%` }}
                />
              </div>
              <span className={cn(
                'text-sm font-black tabular-nums w-14',
                winner === 'red' ? 'text-red-400' : 'text-red-400/60',
              )}>
                {redWinProb.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className={cn('text-[10px] font-bold', winner === 'blue' ? 'text-blue-400' : 'text-zinc-600')}>
                {blueCode} {winner === 'blue' && <Trophy className="inline h-3 w-3 text-yellow-500" />}
              </span>
              <span className="text-[9px] text-zinc-600">
                Previu {predictedWinner === 'blue' ? blueCode : redCode}
                {' · '}Venceu {winner === 'blue' ? blueCode : redCode}
              </span>
              <span className={cn('text-[10px] font-bold', winner === 'red' ? 'text-red-400' : 'text-zinc-600')}>
                {winner === 'red' && <Trophy className="inline h-3 w-3 text-yellow-500" />} {redCode}
              </span>
            </div>
          </div>
        )}

        {/* ── Objectives Table ── */}
        {objectives.length > 0 && (
          <div className="bg-zinc-800/40 rounded-lg overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_80px_40px_80px_56px] gap-1 px-3 py-1.5 bg-zinc-800/60 border-b border-zinc-700/50">
              <span className="text-[9px] text-zinc-500 uppercase font-semibold">Objetivo</span>
              <span className="text-[9px] text-zinc-500 uppercase font-semibold text-center">Previsto</span>
              <span className="text-[9px] text-zinc-500 uppercase font-semibold text-center" />
              <span className="text-[9px] text-zinc-500 uppercase font-semibold text-center">Real</span>
              <span className="text-[9px] text-zinc-500 uppercase font-semibold text-right">Erro</span>
            </div>
            {/* Rows */}
            {objectives.map((obj, i) => {
              if (obj.predicted == null) return null;
              const diff = obj.actual - obj.predicted;
              const inRange = obj.range
                ? obj.actual >= obj.range[0] && obj.actual <= obj.range[1]
                : Math.abs(diff) <= 2;
              return (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_80px_40px_80px_56px] gap-1 px-3 py-2 border-b border-zinc-800/50 last:border-0 items-center"
                >
                  <div className="flex items-center gap-1.5">
                    {obj.icon}
                    <span className="text-xs text-zinc-300 font-medium">{obj.label}</span>
                  </div>
                  <div className="text-center">
                    <span className="text-sm font-bold text-zinc-200 tabular-nums">
                      {obj.predicted % 1 === 0 ? obj.predicted : obj.predicted.toFixed(1)}
                    </span>
                    {obj.range && (
                      <p className="text-[9px] text-zinc-600 tabular-nums">{obj.range[0]}–{obj.range[1]}</p>
                    )}
                  </div>
                  <div className="flex justify-center">
                    <ArrowRight size={12} className="text-zinc-600" />
                  </div>
                  <div className="text-center">
                    <span className="text-sm font-black text-zinc-100 tabular-nums">{obj.actual}</span>
                  </div>
                  <div className="flex justify-end">
                    <span className={cn(
                      'text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded',
                      inRange
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-red-500/15 text-red-400',
                    )}>
                      {diff > 0 ? '+' : ''}{diff % 1 === 0 ? diff : diff.toFixed(1)}
                    </span>
                  </div>
                </div>
              );
            })}
            {/* Game time row */}
            {(predictedTime != null || actualTimeMin != null) && (
              <div className="grid grid-cols-[1fr_80px_40px_80px_56px] gap-1 px-3 py-2 border-t border-zinc-700/50 items-center">
                <div className="flex items-center gap-1.5">
                  <Clock size={13} className="text-teal-400" />
                  <span className="text-xs text-zinc-300 font-medium">Tempo</span>
                </div>
                <div className="text-center">
                  {predictedTime != null ? (
                    <>
                      <span className="text-sm font-bold text-zinc-200 tabular-nums">
                        {formatTime(predictedTime)}
                      </span>
                      {timeRange && (
                        <p className="text-[9px] text-zinc-600 tabular-nums">{formatTime(timeRange[0])}–{formatTime(timeRange[1])}</p>
                      )}
                    </>
                  ) : (
                    <span className="text-[10px] text-zinc-600">—</span>
                  )}
                </div>
                <div className="flex justify-center">
                  <ArrowRight size={12} className="text-zinc-600" />
                </div>
                <div className="text-center">
                  {actualTimeMin != null ? (
                    <span className="text-sm font-black text-zinc-100 tabular-nums">
                      {formatTime(actualTimeMin)}
                    </span>
                  ) : (
                    <span className="text-[10px] text-zinc-600">—</span>
                  )}
                </div>
                <div className="flex justify-end">
                  {predictedTime != null && actualTimeMin != null ? (
                    (() => {
                      const diff = actualTimeMin - predictedTime;
                      const inRange = timeRange
                        ? actualTimeMin >= timeRange[0] && actualTimeMin <= timeRange[1]
                        : Math.abs(diff) <= 3;
                      return (
                        <span className={cn(
                          'text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded',
                          inRange
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-red-500/15 text-red-400',
                        )}>
                          {diff > 0 ? '+' : ''}{diff.toFixed(1)}m
                        </span>
                      );
                    })()
                  ) : null}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Composition Analysis ── */}
        {blueComp.length > 0 && redComp.length > 0 && (
          <div className="bg-zinc-800/40 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Swords size={13} className="text-amber-400" />
              <span className="text-[10px] text-zinc-500 uppercase font-semibold">Perfil de Composicao</span>
            </div>
            <div className="grid grid-cols-[1fr_40px_1fr] gap-x-2 gap-y-0.5">
              {/* Labels row */}
              <span className="text-[9px] font-bold text-blue-400 text-right">{blueCode}</span>
              <span />
              <span className="text-[9px] font-bold text-red-400">{redCode}</span>
              {/* Score bars */}
              {Object.entries(COMP_LABELS).map(([key, label]) => {
                const bVal = (comp!.blue as unknown as Record<string, number>)[key] ?? 0;
                const rVal = (comp!.red as unknown as Record<string, number>)[key] ?? 0;
                const maxVal = Math.max(bVal, rVal, 1);
                return (
                  <div key={key} className="contents">
                    <div className="flex items-center gap-1 justify-end">
                      <span className={cn(
                        'text-[10px] tabular-nums font-bold',
                        bVal > rVal ? 'text-blue-400' : bVal === rVal ? 'text-zinc-500' : 'text-zinc-600',
                      )}>
                        {bVal.toFixed(1)}
                      </span>
                      <div className="w-16 h-1.5 rounded-full bg-zinc-700 overflow-hidden flex justify-end">
                        <div
                          className={cn('h-full rounded-full', bVal >= rVal ? 'bg-blue-500' : 'bg-blue-500/30')}
                          style={{ width: `${(bVal / maxVal) * 100}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-[9px] text-zinc-500 text-center leading-[18px]">{label}</span>
                    <div className="flex items-center gap-1">
                      <div className="w-16 h-1.5 rounded-full bg-zinc-700 overflow-hidden">
                        <div
                          className={cn('h-full rounded-full', rVal >= bVal ? 'bg-red-500' : 'bg-red-500/30')}
                          style={{ width: `${(rVal / maxVal) * 100}%` }}
                        />
                      </div>
                      <span className={cn(
                        'text-[10px] tabular-nums font-bold',
                        rVal > bVal ? 'text-red-400' : rVal === bVal ? 'text-zinc-500' : 'text-zinc-600',
                      )}>
                        {rVal.toFixed(1)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
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

  // Game duration in seconds (normalize from either field)
  const gameLengthSec = stats?.game_length ?? stats?.game_time_sec ?? null;

  // Format game duration
  const gameDuration = gameLengthSec
    ? `${Math.floor(gameLengthSec / 60)}:${String(Math.round(gameLengthSec % 60)).padStart(2, '0')}`
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
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 sm:px-4 sm:py-3 border-b border-zinc-800 bg-zinc-900/50">
        {/* Blue team */}
        <div className="flex items-center gap-2 sm:gap-3">
          {game.blue_team.image && (
            <img
              src={game.blue_team.image}
              alt={game.blue_team.code}
              className={cn(
                'h-7 w-7 sm:h-10 sm:w-10 object-contain',
                winner === 'blue' && 'ring-2 ring-yellow-500 rounded-lg'
              )}
            />
          )}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-sm sm:text-base font-bold text-blue-400">{game.blue_team.code}</span>
            {winner === 'blue' && <Trophy size={14} className="text-yellow-500 sm:w-4 sm:h-4" />}
          </div>
        </div>

        {/* Center */}
        <div className="flex flex-col items-center gap-0.5 sm:gap-1">
          <CompletedBadge />
          <span className="text-[10px] sm:text-xs font-medium text-zinc-500">Game {game.number}</span>
        </div>

        {/* Red team */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 sm:gap-2">
            {winner === 'red' && <Trophy size={14} className="text-yellow-500 sm:w-4 sm:h-4" />}
            <span className="text-sm sm:text-base font-bold text-red-400">{game.red_team.code}</span>
          </div>
          {game.red_team.image && (
            <img
              src={game.red_team.image}
              alt={game.red_team.code}
              className={cn(
                'h-7 w-7 sm:h-10 sm:w-10 object-contain',
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
        <div className="overflow-x-auto border-b border-zinc-800">
        <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 bg-zinc-800/30 min-w-[480px]">
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
        </div>
      )}

      {/* Column headers */}
      {hasPlayers && (
        <div className="overflow-x-auto">
        <div className="flex items-center px-3 sm:px-4 py-1.5 border-b border-zinc-800/50 bg-zinc-900/30 min-w-[560px]">
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
        </div>
      )}

      {/* Player rows */}
      {(hasPlayers || draft) && (
        <div className="overflow-x-auto">
        <div className="px-3 sm:px-4 py-1 min-w-[560px]">
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

      {/* Prediction vs Result */}
      {game.saved_prediction && hasStats && (
        <PredictionVsResult
          savedPrediction={game.saved_prediction}
          stats={stats}
          winner={winner}
          blueCode={game.blue_team.code}
          redCode={game.red_team.code}
          gameDuration={gameLengthSec}
        />
      )}
    </div>
  );
}

export const CompletedGameScoreboard = memo(CompletedGameScoreboardComponent);
export default CompletedGameScoreboard;
