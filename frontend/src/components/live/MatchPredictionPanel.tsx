import { memo } from 'react';
import { TrendingUp, Swords, Target, Mountain, Crown, Clock } from 'lucide-react';
import { LiveGameDraft, DraftPredictions, MatchPredictionEnriched } from '@/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POSITIONS = ['top', 'jng', 'mid', 'bot', 'sup'] as const;

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

function champImgUrl(ver: string, championName: string): string {
  if (!ver || !championName) return '';
  const key = getChampionKey(championName);
  return `https://ddragon.leagueoflegends.com/cdn/${ver}/img/champion/${key}.png`;
}

function formatMinutesToTime(minutes: number): string {
  const mins = Math.floor(minutes);
  const secs = Math.round((minutes - mins) * 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function formatRange(range?: [number, number]): string {
  if (!range) return '';
  return `${range[0]}-${range[1]}`;
}

function formatTimeRange(range?: [number, number]): string {
  if (!range) return '';
  return `${formatMinutesToTime(range[0])} - ${formatMinutesToTime(range[1])}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface MatchPredictionPanelProps {
  draft: LiveGameDraft;
  predictions?: DraftPredictions | null;
  predictionMessage?: string;
  matchPrediction?: MatchPredictionEnriched | null;
  blueTeam: { name: string; code: string; image?: string };
  redTeam: { name: string; code: string; image?: string };
  ddragonVersion: string;
}

function MatchPredictionPanelComponent({
  draft,
  predictions,
  predictionMessage,
  matchPrediction,
  blueTeam,
  redTeam,
  ddragonVersion,
}: MatchPredictionPanelProps) {
  const hasPredictions = predictions != null;
  const blueBetter = hasPredictions && predictions.blue_win_prob > predictions.red_win_prob;

  // Get champion names for each position
  const blueChampions = POSITIONS.map((pos) => draft[`blue_${pos}` as keyof LiveGameDraft] as string);
  const redChampions = POSITIONS.map((pos) => draft[`red_${pos}` as keyof LiveGameDraft] as string);

  // Compare with team-only prediction if available
  const hasComparison = hasPredictions && matchPrediction?.team1_win_prob != null;
  const teamOnlyBlueProb = matchPrediction?.team1_win_prob ?? 50;
  const draftDiff = hasPredictions ? predictions.blue_win_prob - teamOnlyBlueProb : 0;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-800/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-400" />
            <span className="text-sm font-semibold text-zinc-200">Predicao da Partida</span>
          </div>
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Draft + Contexto</span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Teams with Draft */}
        <div className="flex items-center justify-between gap-2">
          {/* Blue Team */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              {blueTeam.image && (
                <img src={blueTeam.image} alt={blueTeam.code} className="h-8 w-8 object-contain" />
              )}
              <div>
                <p className="text-sm font-bold text-blue-400">{blueTeam.code}</p>
                <p className="text-[10px] text-zinc-500">{blueTeam.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {blueChampions.map((champ, idx) => (
                <img
                  key={idx}
                  src={champImgUrl(ddragonVersion, champ)}
                  alt={champ}
                  title={champ}
                  className="w-8 h-8 rounded bg-zinc-800 ring-1 ring-blue-500/30"
                  loading="lazy"
                />
              ))}
            </div>
          </div>

          {/* Win Probability Center */}
          <div className="flex flex-col items-center px-4">
            {hasPredictions ? (
              <>
                <div className="flex items-center gap-3 mb-1">
                  <span className={`text-2xl font-black ${blueBetter ? 'text-blue-400' : 'text-zinc-500'}`}>
                    {predictions.blue_win_prob}%
                  </span>
                  <span className="text-zinc-600">-</span>
                  <span className={`text-2xl font-black ${!blueBetter ? 'text-red-400' : 'text-zinc-500'}`}>
                    {predictions.red_win_prob}%
                  </span>
                </div>
                {hasComparison && Math.abs(draftDiff) >= 1 && (
                  <p className="text-[10px] text-zinc-500">
                    Draft: {draftDiff > 0 ? '+' : ''}{draftDiff.toFixed(1)}% para {draftDiff > 0 ? 'Blue' : 'Red'}
                  </p>
                )}
              </>
            ) : (
              <span className="text-sm font-bold text-zinc-500">VS</span>
            )}
          </div>

          {/* Red Team */}
          <div className="flex-1">
            <div className="flex items-center justify-end gap-2 mb-2">
              <div className="text-right">
                <p className="text-sm font-bold text-red-400">{redTeam.code}</p>
                <p className="text-[10px] text-zinc-500">{redTeam.name}</p>
              </div>
              {redTeam.image && (
                <img src={redTeam.image} alt={redTeam.code} className="h-8 w-8 object-contain" />
              )}
            </div>
            <div className="flex items-center justify-end gap-1">
              {redChampions.map((champ, idx) => (
                <img
                  key={idx}
                  src={champImgUrl(ddragonVersion, champ)}
                  alt={champ}
                  title={champ}
                  className="w-8 h-8 rounded bg-zinc-800 ring-1 ring-red-500/30"
                  loading="lazy"
                />
              ))}
            </div>
          </div>
        </div>

        {/* Win Probability Bar or Unavailable Message */}
        {hasPredictions ? (
          <>
            <div className="h-3 rounded-full overflow-hidden flex bg-zinc-800">
              <div
                className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-500"
                style={{ width: `${predictions.blue_win_prob}%` }}
              />
              <div
                className="h-full bg-gradient-to-r from-red-400 to-red-600 transition-all duration-500"
                style={{ width: `${predictions.red_win_prob}%` }}
              />
            </div>

            {/* Predicted Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
              <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Swords size={12} className="text-zinc-500" />
                  <span className="text-[10px] text-zinc-500 uppercase">Kills</span>
                </div>
                <p className="text-lg font-bold text-zinc-200">{predictions.total_kills}</p>
                {predictions.kills_range && (
                  <p className="text-[10px] text-zinc-500">{formatRange(predictions.kills_range)}</p>
                )}
              </div>

              <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Target size={12} className="text-zinc-500" />
                  <span className="text-[10px] text-zinc-500 uppercase">Torres</span>
                </div>
                <p className="text-lg font-bold text-zinc-200">{predictions.total_towers}</p>
                {predictions.towers_range && (
                  <p className="text-[10px] text-zinc-500">{formatRange(predictions.towers_range)}</p>
                )}
              </div>

              <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Mountain size={12} className="text-zinc-500" />
                  <span className="text-[10px] text-zinc-500 uppercase">Dragons</span>
                </div>
                <p className="text-lg font-bold text-zinc-200">{predictions.total_dragons}</p>
                {predictions.dragons_range && (
                  <p className="text-[10px] text-zinc-500">{formatRange(predictions.dragons_range)}</p>
                )}
              </div>

              <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Crown size={12} className="text-zinc-500" />
                  <span className="text-[10px] text-zinc-500 uppercase">Barons</span>
                </div>
                <p className="text-lg font-bold text-zinc-200">{predictions.total_barons}</p>
                {predictions.barons_range && (
                  <p className="text-[10px] text-zinc-500">{formatRange(predictions.barons_range)}</p>
                )}
              </div>

              <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Clock size={12} className="text-zinc-500" />
                  <span className="text-[10px] text-zinc-500 uppercase">Tempo</span>
                </div>
                <p className="text-lg font-bold text-zinc-200">
                  {matchPrediction?.game_time ? formatMinutesToTime(matchPrediction.game_time) : '--'}
                </p>
                {matchPrediction?.game_time_range && (
                  <p className="text-[10px] text-zinc-500">{formatTimeRange(matchPrediction.game_time_range)}</p>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="bg-zinc-800/30 rounded-lg px-4 py-3 text-center">
            <p className="text-xs text-zinc-500">
              {predictionMessage || 'Predicao indisponivel para esta partida'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export const MatchPredictionPanel = memo(MatchPredictionPanelComponent);
