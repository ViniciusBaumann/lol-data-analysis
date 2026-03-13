import { memo, useState, useCallback } from 'react';
import { TrendingUp, Swords, Target, Mountain, Crown, Clock, ExternalLink, Zap, Flame, TrendingDown, Users, Coins, Sparkles, Loader2 } from 'lucide-react';
import { LiveGameDraft, DraftPredictions, MatchPredictionEnriched, TeamContext, CompositionAnalysis, CompositionScores, ChampionPowerSpike, DraftPredictionResponse } from '@/types';
import { getDraftPrediction } from '@/services/draft';

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

const SPIKE_TAG_LABELS: Record<string, string> = {
  hypercarry: 'Hypercarry',
  scaling: 'Scaling',
  early_game: 'Early Game',
  assassin: 'Assassino',
  bruiser: 'Bruiser',
  tank: 'Tank',
  enchanter: 'Enchanter',
  default: 'Padrao',
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

function buildSpikeTooltip(champ: string, spike: ChampionPowerSpike | undefined): string {
  if (!spike) return champ;
  const tagLabel = SPIKE_TAG_LABELS[spike.spike_tag] || spike.spike_tag;
  const timeFormatted = formatMinutesToTime(spike.spike_time_min);
  return `${champ}\n` +
    `Power Spike: ${spike.items} ${spike.items === 1 ? 'item' : 'itens'}\n` +
    `Gold necessario: ${spike.gold_threshold.toLocaleString()}g\n` +
    `Tempo estimado: ~${timeFormatted}\n` +
    `Tipo: ${tagLabel}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface MatchPredictionPanelProps {
  draft: LiveGameDraft;
  predictions?: DraftPredictions | null;
  predictionMessage?: string;
  matchPrediction?: MatchPredictionEnriched | null;
  teamContext?: TeamContext | null;
  composition?: CompositionAnalysis | null;
  powerSpikes?: Record<string, ChampionPowerSpike> | null;
  blueTeam: { name: string; code: string; image?: string };
  redTeam: { name: string; code: string; image?: string };
  ddragonVersion: string;
}

// Composition type labels and colors
const COMP_TYPES: { key: keyof CompositionScores; label: string; icon: string }[] = [
  { key: 'early_game', label: 'Early', icon: '⚡' },
  { key: 'scaling', label: 'Scale', icon: '📈' },
  { key: 'teamfight', label: 'TF', icon: '⚔️' },
  { key: 'splitpush', label: 'Split', icon: '🏃' },
  { key: 'poke', label: 'Poke', icon: '🎯' },
  { key: 'engage', label: 'Engage', icon: '🚀' },
  { key: 'pick', label: 'Pick', icon: '🎣' },
  { key: 'siege', label: 'Siege', icon: '🏰' },
];

function getTopCompTypes(scores: CompositionScores, threshold: number = 0.4): { key: keyof CompositionScores; value: number }[] {
  const results = COMP_TYPES
    .map(t => ({ key: t.key, value: scores[t.key] }))
    .filter(t => {
      // Siege: show if at least 1 champion (score > 0)
      if (t.key === 'siege') return t.value > 0;
      return t.value >= threshold;
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 4); // Allow up to 4 tags to accommodate siege
  return results;
}

function getDamageWarning(scores: CompositionScores): { type: 'heavy_ap' | 'heavy_ad' | 'low_damage' | null; label: string; icon: string } | null {
  const apCount = scores.ap_count ?? 0;
  const adCount = scores.ad_count ?? 0;
  const totalDamage = apCount + adCount;

  // Heavy AP: 4+ AP damage dealers
  if (apCount >= 4) {
    return { type: 'heavy_ap', label: 'Full AP', icon: '🔮' };
  }
  // Heavy AD: 4+ AD damage dealers
  if (adCount >= 4) {
    return { type: 'heavy_ad', label: 'Full AD', icon: '⚔️' };
  }
  return null;
}

function hasNoEngage(scores: CompositionScores): boolean {
  return (scores.engage ?? 0) < 0.1;
}

function MatchPredictionPanelComponent({
  draft,
  predictions,
  predictionMessage,
  matchPrediction,
  teamContext,
  composition,
  powerSpikes,
  blueTeam,
  redTeam,
  ddragonVersion,
}: MatchPredictionPanelProps) {
  // Draft-only mode state
  const [draftOnlyMode, setDraftOnlyMode] = useState(false);
  const [draftOnlyPredictions, setDraftOnlyPredictions] = useState<DraftPredictions | null>(null);
  const [draftOnlyComposition, setDraftOnlyComposition] = useState<CompositionAnalysis | null>(null);
  const [draftOnlyPowerSpikes, setDraftOnlyPowerSpikes] = useState<Record<string, ChampionPowerSpike> | null>(null);
  const [draftOnlyLoading, setDraftOnlyLoading] = useState(false);

  const handleToggleDraftOnly = useCallback(async () => {
    const nextMode = !draftOnlyMode;
    setDraftOnlyMode(nextMode);

    if (nextMode && !draftOnlyPredictions) {
      // Fetch draft-only prediction (no team IDs)
      setDraftOnlyLoading(true);
      try {
        const draftPayload: Record<string, string> = {};
        for (const side of ['blue', 'red'] as const) {
          for (const pos of POSITIONS) {
            const slot = `${side}_${pos}` as keyof LiveGameDraft;
            draftPayload[slot] = draft[slot] as string;
          }
        }
        const result: DraftPredictionResponse = await getDraftPrediction(draftPayload);
        setDraftOnlyPredictions(result.predictions);
        setDraftOnlyComposition(result.composition ?? null);
        setDraftOnlyPowerSpikes(result.power_spikes ?? null);
      } catch (err) {
        console.error('Draft-only prediction failed:', err);
      } finally {
        setDraftOnlyLoading(false);
      }
    }
  }, [draftOnlyMode, draftOnlyPredictions, draft]);

  // Select active data based on mode
  const activePredictions = draftOnlyMode ? draftOnlyPredictions : (predictions ?? null);
  const activeComposition = draftOnlyMode ? draftOnlyComposition : (composition ?? null);
  const activePowerSpikes = draftOnlyMode ? draftOnlyPowerSpikes : (powerSpikes ?? null);

  const hasPredictions = activePredictions != null;
  const blueBetter = hasPredictions && activePredictions.blue_win_prob > activePredictions.red_win_prob;
  const hasTeamContext = teamContext != null;
  const hasComposition = activeComposition != null;

  // Get champion names for each position
  const blueChampions = POSITIONS.map((pos) => draft[`blue_${pos}` as keyof LiveGameDraft] as string);
  const redChampions = POSITIONS.map((pos) => draft[`red_${pos}` as keyof LiveGameDraft] as string);

  // Compare with team-only prediction if available (only in normal mode)
  const hasComparison = !draftOnlyMode && hasPredictions && matchPrediction?.team1_win_prob != null;
  const teamOnlyBlueProb = matchPrediction?.team1_win_prob ?? 50;
  const draftDiff = hasPredictions ? activePredictions.blue_win_prob - teamOnlyBlueProb : 0;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 sm:px-4 sm:py-3 border-b border-zinc-800 bg-zinc-800/50">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <TrendingUp size={16} className="text-emerald-400 shrink-0" />
            <span className="text-xs sm:text-sm font-semibold text-zinc-200">Predicao</span>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded shrink-0 ${draftOnlyMode ? 'bg-zinc-700 text-zinc-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
              {draftOnlyMode ? 'Draft' : 'Draft + Ctx'}
            </span>
            {draftOnlyLoading && <Loader2 size={12} className="animate-spin text-zinc-500" />}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Draft-Only Toggle Switch */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleToggleDraftOnly}
                className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none"
                style={{ backgroundColor: draftOnlyMode ? '#52525b' : '#10b981' }}
                title={draftOnlyMode ? 'Ativar contexto de time' : 'Desativar contexto de time (apenas draft)'}
              >
                <span
                  className="inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform"
                  style={{ transform: draftOnlyMode ? 'translateX(2px)' : 'translateX(18px)' }}
                />
              </button>
              <span className="text-[10px] text-zinc-600 hidden sm:inline">Contexto</span>
            </div>
            <button
              onClick={() => {
                const url = `/compare?team1=${encodeURIComponent(blueTeam.name)}&team2=${encodeURIComponent(redTeam.name)}`;
                window.open(url, '_blank');
              }}
              className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium text-zinc-400 hover:text-emerald-400 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
              title="Comparar times em nova aba"
            >
              <ExternalLink size={12} />
              <span className="hidden sm:inline">Comparar</span>
            </button>
          </div>
        </div>
      </div>

      <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">
        {/* Teams with Draft */}
        <div className="flex items-center justify-between gap-1 sm:gap-2">
          {/* Blue Team */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-2">
              {blueTeam.image && (
                <img src={blueTeam.image} alt={blueTeam.code} className="h-6 w-6 sm:h-8 sm:w-8 object-contain shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-bold text-blue-400 truncate">{blueTeam.code}</p>
                <p className="text-[9px] sm:text-[10px] text-zinc-500 truncate hidden sm:block">{blueTeam.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-0.5 sm:gap-1">
              {blueChampions.map((champ, idx) => {
                const slot = `blue_${POSITIONS[idx]}`;
                const spike = activePowerSpikes?.[slot];
                return (
                  <img
                    key={idx}
                    src={champImgUrl(ddragonVersion, champ)}
                    alt={champ}
                    title={buildSpikeTooltip(champ, spike)}
                    className="w-6 h-6 sm:w-8 sm:h-8 rounded bg-zinc-800 ring-1 ring-blue-500/30"
                    loading="lazy"
                  />
                );
              })}
            </div>
          </div>

          {/* Win Probability Center */}
          <div className="flex flex-col items-center px-1 sm:px-4 min-w-[100px] sm:min-w-[160px] shrink-0">
            {hasPredictions ? (
              <>
                <div className="flex items-center gap-1 sm:gap-3 mb-1">
                  <span className={`text-base sm:text-2xl font-black ${blueBetter ? 'text-blue-400' : 'text-zinc-500'}`}>
                    {activePredictions.blue_win_prob}%
                  </span>
                  <span className="text-zinc-600 text-xs sm:text-base">-</span>
                  <span className={`text-base sm:text-2xl font-black ${!blueBetter ? 'text-red-400' : 'text-zinc-500'}`}>
                    {activePredictions.red_win_prob}%
                  </span>
                </div>
                {hasComparison && Math.abs(draftDiff) >= 1 && (
                  <div className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded bg-zinc-800 border border-zinc-700">
                    <Swords size={10} className={draftDiff > 0 ? 'text-blue-400' : 'text-red-400'} />
                    <span className="text-[9px] sm:text-[10px] text-zinc-500 hidden sm:inline">Base {teamOnlyBlueProb.toFixed(0)}%</span>
                    <span className={`text-[10px] sm:text-[11px] font-bold ${draftDiff > 0 ? 'text-blue-400' : 'text-red-400'}`}>
                      {draftDiff > 0 ? '+' : ''}{draftDiff.toFixed(1)}%
                    </span>
                  </div>
                )}
              </>
            ) : (
              <span className="text-sm font-bold text-zinc-500">VS</span>
            )}
          </div>

          {/* Red Team */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-end gap-1.5 sm:gap-2 mb-2">
              <div className="text-right min-w-0">
                <p className="text-xs sm:text-sm font-bold text-red-400 truncate">{redTeam.code}</p>
                <p className="text-[9px] sm:text-[10px] text-zinc-500 truncate hidden sm:block">{redTeam.name}</p>
              </div>
              {redTeam.image && (
                <img src={redTeam.image} alt={redTeam.code} className="h-6 w-6 sm:h-8 sm:w-8 object-contain shrink-0" />
              )}
            </div>
            <div className="flex items-center justify-end gap-0.5 sm:gap-1">
              {redChampions.map((champ, idx) => {
                const slot = `red_${POSITIONS[idx]}`;
                const spike = activePowerSpikes?.[slot];
                return (
                  <img
                    key={idx}
                    src={champImgUrl(ddragonVersion, champ)}
                    alt={champ}
                    title={buildSpikeTooltip(champ, spike)}
                    className="w-6 h-6 sm:w-8 sm:h-8 rounded bg-zinc-800 ring-1 ring-red-500/30"
                    loading="lazy"
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Composition Analysis */}
        {hasComposition && (
          <div className="flex items-center justify-between gap-2 sm:gap-4 px-1 sm:px-2">
            {/* Blue Composition */}
            <div className="flex-1">
              <div className="flex items-center gap-1 flex-wrap">
                {getTopCompTypes(activeComposition.blue).map(({ key, value }) => {
                  const compType = COMP_TYPES.find(t => t.key === key)!;
                  return (
                    <span
                      key={key}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-[10px] font-medium text-blue-400"
                      title={`${compType.label}: ${Math.round(value * 100)}%`}
                    >
                      <span>{compType.icon}</span>
                      <span>{compType.label}</span>
                    </span>
                  );
                })}
                {(() => {
                  const warning = getDamageWarning(activeComposition.blue);
                  if (warning) {
                    return (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-[10px] font-medium text-amber-400"
                        title={warning.type === 'heavy_ap' ? 'Dano muito concentrado em AP' : 'Dano muito concentrado em AD'}
                      >
                        <span>{warning.icon}</span>
                        <span>{warning.label}</span>
                      </span>
                    );
                  }
                  return null;
                })()}
                {hasNoEngage(activeComposition.blue) && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-[10px] font-medium text-amber-400"
                    title="Time sem engage confiavel"
                  >
                    <span>🚫</span>
                    <span>Sem Engage</span>
                  </span>
                )}
                {getTopCompTypes(activeComposition.blue).length === 0 && !getDamageWarning(activeComposition.blue) && !hasNoEngage(activeComposition.blue) && (
                  <span className="text-[10px] text-zinc-500">Comp balanceada</span>
                )}
              </div>
            </div>

            {/* Separator */}
            <div className="flex items-center gap-1 text-zinc-600">
              <Sparkles size={12} />
              <span className="text-[9px]">Comp</span>
            </div>

            {/* Red Composition */}
            <div className="flex-1">
              <div className="flex items-center gap-1 flex-wrap justify-end">
                {getTopCompTypes(activeComposition.red).map(({ key, value }) => {
                  const compType = COMP_TYPES.find(t => t.key === key)!;
                  return (
                    <span
                      key={key}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-[10px] font-medium text-red-400"
                      title={`${compType.label}: ${Math.round(value * 100)}%`}
                    >
                      <span>{compType.icon}</span>
                      <span>{compType.label}</span>
                    </span>
                  );
                })}
                {(() => {
                  const warning = getDamageWarning(activeComposition.red);
                  if (warning) {
                    return (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-[10px] font-medium text-amber-400"
                        title={warning.type === 'heavy_ap' ? 'Dano muito concentrado em AP' : 'Dano muito concentrado em AD'}
                      >
                        <span>{warning.icon}</span>
                        <span>{warning.label}</span>
                      </span>
                    );
                  }
                  return null;
                })()}
                {hasNoEngage(activeComposition.red) && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-[10px] font-medium text-amber-400"
                    title="Time sem engage confiavel"
                  >
                    <span>🚫</span>
                    <span>Sem Engage</span>
                  </span>
                )}
                {getTopCompTypes(activeComposition.red).length === 0 && !getDamageWarning(activeComposition.red) && !hasNoEngage(activeComposition.red) && (
                  <span className="text-[10px] text-zinc-500">Comp balanceada</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Win Probability Bar or Unavailable Message */}
        {hasPredictions ? (
          <>
            <div className="relative">
              <div className="h-3 rounded-full overflow-hidden flex bg-zinc-800">
                <div
                  className="h-full bg-blue-500 transition-all duration-500"
                  style={{ width: `${activePredictions.blue_win_prob}%` }}
                />
                <div
                  className="h-full bg-red-500 transition-all duration-500"
                  style={{ width: `${activePredictions.red_win_prob}%` }}
                />
              </div>
              {/* Team-only prediction marker (shows draft shift on the bar) */}
              {hasComparison && Math.abs(draftDiff) >= 1 && (
                <div
                  className="absolute top-0 h-full flex flex-col items-center pointer-events-none transition-all duration-500"
                  style={{ left: `${teamOnlyBlueProb}%` }}
                >
                  <div className="w-0.5 h-full bg-zinc-400/60" />
                  <span className="text-[9px] text-zinc-500 mt-0.5 whitespace-nowrap">
                    sem draft {teamOnlyBlueProb.toFixed(0)}%
                  </span>
                </div>
              )}
            </div>

            {/* Key Factors - Fatores Decisivos (hidden in draft-only mode) */}
            {!draftOnlyMode && hasTeamContext && (
              <div className="pt-2">
                <p className="text-[10px] text-zinc-500 mb-2">Fatores Decisivos</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {/* Draft Impact */}
                  {hasComparison && (() => {
                    const draftImpact = draftDiff;
                    const draftColor = draftImpact > 0 ? 'text-blue-400' : draftImpact < 0 ? 'text-red-400' : 'text-zinc-400';
                    const hasSignificantImpact = Math.abs(draftImpact) >= 3;
                    return (
                      <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                        <div className="flex items-center justify-center gap-1 mb-0.5">
                          <Swords size={10} className={hasSignificantImpact ? draftColor : 'text-zinc-500'} />
                          <span className="text-[9px] text-zinc-500 uppercase">Draft</span>
                        </div>
                        <p className={`text-xs font-bold ${draftColor}`}>
                          {draftImpact > 0 ? '+' : ''}{draftImpact.toFixed(1)}%
                        </p>
                        <p className="text-[9px] text-zinc-600">
                          {draftImpact > 0 ? 'Blue' : draftImpact < 0 ? 'Red' : 'Neutro'}
                        </p>
                      </div>
                    );
                  })()}

                  {/* ELO Difference */}
                  {(() => {
                    const blueElo = teamContext.blue_team.elo.global;
                    const redElo = teamContext.red_team.elo.global;
                    const eloDiff = blueElo - redElo;
                    const eloAdvantage = Math.abs(eloDiff) >= 20;
                    const eloColor = eloDiff > 0 ? 'text-blue-400' : eloDiff < 0 ? 'text-red-400' : 'text-zinc-400';
                    return (
                      <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                        <div className="flex items-center justify-center gap-1 mb-0.5">
                          <Zap size={10} className={eloAdvantage ? eloColor : 'text-zinc-500'} />
                          <span className="text-[9px] text-zinc-500 uppercase">ELO</span>
                        </div>
                        <p className={`text-xs font-bold ${eloColor}`}>
                          {eloDiff > 0 ? '+' : ''}{Math.round(eloDiff)}
                        </p>
                        <p className="text-[9px] text-zinc-600">
                          {Math.round(blueElo)} vs {Math.round(redElo)}
                        </p>
                      </div>
                    );
                  })()}

                  {/* Win Rate Last 5 */}
                  {teamContext.blue_team.stats && teamContext.red_team.stats && (() => {
                    const blueWR = teamContext.blue_team.stats.win_rate_last5;
                    const redWR = teamContext.red_team.stats.win_rate_last5;
                    const wrDiff = blueWR - redWR;
                    const wrColor = wrDiff > 0 ? 'text-blue-400' : wrDiff < 0 ? 'text-red-400' : 'text-zinc-400';
                    return (
                      <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                        <div className="flex items-center justify-center gap-1 mb-0.5">
                          <Flame size={10} className={Math.abs(wrDiff) >= 20 ? wrColor : 'text-zinc-500'} />
                          <span className="text-[9px] text-zinc-500 uppercase">Forma</span>
                        </div>
                        <p className={`text-xs font-bold ${wrColor}`}>
                          {wrDiff > 0 ? '+' : ''}{wrDiff.toFixed(0)}%
                        </p>
                        <p className="text-[9px] text-zinc-600">
                          {blueWR.toFixed(0)}% vs {redWR.toFixed(0)}%
                        </p>
                      </div>
                    );
                  })()}

                  {/* Gold Diff @15 */}
                  {teamContext.blue_team.stats && teamContext.red_team.stats && (() => {
                    const blueGold = teamContext.blue_team.stats.avg_golddiffat15;
                    const redGold = teamContext.red_team.stats.avg_golddiffat15;
                    // Hide when both are 0 (indicates no data available)
                    if (blueGold === 0 && redGold === 0) return null;
                    const goldDiff = blueGold - redGold;
                    const goldColor = goldDiff > 0 ? 'text-blue-400' : goldDiff < 0 ? 'text-red-400' : 'text-zinc-400';
                    return (
                      <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                        <div className="flex items-center justify-center gap-1 mb-0.5">
                          <Coins size={10} className={Math.abs(goldDiff) >= 500 ? goldColor : 'text-zinc-500'} />
                          <span className="text-[9px] text-zinc-500 uppercase">Gold@15</span>
                        </div>
                        <p className={`text-xs font-bold ${goldColor}`}>
                          {goldDiff > 0 ? '+' : ''}{Math.round(goldDiff)}
                        </p>
                        <p className="text-[9px] text-zinc-600">
                          {blueGold > 0 ? '+' : ''}{Math.round(blueGold)} vs {redGold > 0 ? '+' : ''}{Math.round(redGold)}
                        </p>
                      </div>
                    );
                  })()}

                  {/* H2H */}
                  {teamContext.h2h.total_games > 0 && (() => {
                    const blueH2H = teamContext.h2h.blue_win_rate;
                    const redH2H = teamContext.h2h.red_win_rate;
                    const h2hDiff = blueH2H - redH2H;
                    const h2hColor = h2hDiff > 0 ? 'text-blue-400' : h2hDiff < 0 ? 'text-red-400' : 'text-zinc-400';
                    return (
                      <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                        <div className="flex items-center justify-center gap-1 mb-0.5">
                          <Users size={10} className={Math.abs(h2hDiff) >= 20 ? h2hColor : 'text-zinc-500'} />
                          <span className="text-[9px] text-zinc-500 uppercase">H2H</span>
                        </div>
                        <p className={`text-xs font-bold ${h2hColor}`}>
                          {blueH2H.toFixed(0)}% - {redH2H.toFixed(0)}%
                        </p>
                        <p className="text-[9px] text-zinc-600">
                          {teamContext.h2h.total_games} jogos
                        </p>
                      </div>
                    );
                  })()}

                  {/* Streak */}
                  {teamContext.blue_team.stats && teamContext.red_team.stats && (() => {
                    const blueStreak = teamContext.blue_team.stats.streak;
                    const redStreak = teamContext.red_team.stats.streak;
                    const streakDiff = blueStreak - redStreak;
                    const streakColor = streakDiff > 0 ? 'text-blue-400' : streakDiff < 0 ? 'text-red-400' : 'text-zinc-400';
                    const formatStreak = (s: number) => s > 0 ? `${s}W` : s < 0 ? `${Math.abs(s)}L` : '0';
                    return (
                      <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                        <div className="flex items-center justify-center gap-1 mb-0.5">
                          {streakDiff >= 0 ? (
                            <TrendingUp size={10} className={Math.abs(streakDiff) >= 2 ? streakColor : 'text-zinc-500'} />
                          ) : (
                            <TrendingDown size={10} className={Math.abs(streakDiff) >= 2 ? streakColor : 'text-zinc-500'} />
                          )}
                          <span className="text-[9px] text-zinc-500 uppercase">Streak</span>
                        </div>
                        <p className={`text-xs font-bold ${streakColor}`}>
                          {formatStreak(blueStreak)} vs {formatStreak(redStreak)}
                        </p>
                        <p className="text-[9px] text-zinc-600">
                          sequencia
                        </p>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Predicted Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
              <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Swords size={12} className="text-zinc-500" />
                  <span className="text-[10px] text-zinc-500 uppercase">Kills</span>
                </div>
                <p className="text-lg font-bold text-zinc-200">{activePredictions.total_kills}</p>
                {activePredictions.kills_range && (
                  <p className="text-[10px] text-zinc-500">{formatRange(activePredictions.kills_range)}</p>
                )}
              </div>

              <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Target size={12} className="text-zinc-500" />
                  <span className="text-[10px] text-zinc-500 uppercase">Torres</span>
                </div>
                <p className="text-lg font-bold text-zinc-200">{activePredictions.total_towers}</p>
                {activePredictions.towers_range && (
                  <p className="text-[10px] text-zinc-500">{formatRange(activePredictions.towers_range)}</p>
                )}
              </div>

              <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Mountain size={12} className="text-zinc-500" />
                  <span className="text-[10px] text-zinc-500 uppercase">Dragons</span>
                </div>
                <p className="text-lg font-bold text-zinc-200">{activePredictions.total_dragons}</p>
                {activePredictions.dragons_range && (
                  <p className="text-[10px] text-zinc-500">{formatRange(activePredictions.dragons_range)}</p>
                )}
              </div>

              <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Crown size={12} className="text-zinc-500" />
                  <span className="text-[10px] text-zinc-500 uppercase">Barons</span>
                </div>
                <p className="text-lg font-bold text-zinc-200">{activePredictions.total_barons}</p>
                {activePredictions.barons_range && (
                  <p className="text-[10px] text-zinc-500">{formatRange(activePredictions.barons_range)}</p>
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
