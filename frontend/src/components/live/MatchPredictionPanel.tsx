import { memo } from 'react';
import { TrendingUp, Swords, Target, Mountain, Crown, Clock, ExternalLink, Zap, Flame, TrendingDown, Users, Coins, Sparkles } from 'lucide-react';
import { LiveGameDraft, DraftPredictions, MatchPredictionEnriched, TeamContext, CompositionAnalysis, CompositionScores } from '@/types';

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
  teamContext?: TeamContext | null;
  composition?: CompositionAnalysis | null;
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
  // Low damage: 0-1 damage dealers identified
  if (totalDamage <= 1) {
    return { type: 'low_damage', label: 'Low DMG', icon: '⚠️' };
  }
  return null;
}

function MatchPredictionPanelComponent({
  draft,
  predictions,
  predictionMessage,
  matchPrediction,
  teamContext,
  composition,
  blueTeam,
  redTeam,
  ddragonVersion,
}: MatchPredictionPanelProps) {
  const hasPredictions = predictions != null;
  const blueBetter = hasPredictions && predictions.blue_win_prob > predictions.red_win_prob;
  const hasTeamContext = teamContext != null;
  const hasComposition = composition != null;

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
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Draft + Contexto</span>
            <button
              onClick={() => {
                const url = `/compare?team1=${encodeURIComponent(blueTeam.name)}&team2=${encodeURIComponent(redTeam.name)}`;
                window.open(url, '_blank');
              }}
              className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium text-zinc-400 hover:text-emerald-400 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
              title="Comparar times em nova aba"
            >
              <ExternalLink size={12} />
              Comparar
            </button>
          </div>
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

        {/* Composition Analysis */}
        {hasComposition && (
          <div className="flex items-center justify-between gap-4 px-2">
            {/* Blue Composition */}
            <div className="flex-1">
              <div className="flex items-center gap-1 flex-wrap">
                {getTopCompTypes(composition.blue).map(({ key, value }) => {
                  const compType = COMP_TYPES.find(t => t.key === key)!;
                  return (
                    <span
                      key={key}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-medium text-blue-400"
                      title={`${compType.label}: ${Math.round(value * 100)}%`}
                    >
                      <span>{compType.icon}</span>
                      <span>{compType.label}</span>
                    </span>
                  );
                })}
                {(() => {
                  const warning = getDamageWarning(composition.blue);
                  if (warning) {
                    return (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-[10px] font-medium text-amber-400"
                        title={warning.type === 'heavy_ap' ? 'Dano muito concentrado em AP' : warning.type === 'heavy_ad' ? 'Dano muito concentrado em AD' : 'Poucos dealers de dano identificados'}
                      >
                        <span>{warning.icon}</span>
                        <span>{warning.label}</span>
                      </span>
                    );
                  }
                  return null;
                })()}
                {getTopCompTypes(composition.blue).length === 0 && !getDamageWarning(composition.blue) && (
                  <span className="text-[10px] text-zinc-500">Comp balanceada</span>
                )}
              </div>
            </div>

            {/* Separator */}
            <div className="flex items-center gap-1 text-zinc-600">
              <Sparkles size={12} />
              <span className="text-[9px] uppercase tracking-wider">Comp</span>
            </div>

            {/* Red Composition */}
            <div className="flex-1">
              <div className="flex items-center gap-1 flex-wrap justify-end">
                {getTopCompTypes(composition.red).map(({ key, value }) => {
                  const compType = COMP_TYPES.find(t => t.key === key)!;
                  return (
                    <span
                      key={key}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-[10px] font-medium text-red-400"
                      title={`${compType.label}: ${Math.round(value * 100)}%`}
                    >
                      <span>{compType.icon}</span>
                      <span>{compType.label}</span>
                    </span>
                  );
                })}
                {(() => {
                  const warning = getDamageWarning(composition.red);
                  if (warning) {
                    return (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-[10px] font-medium text-amber-400"
                        title={warning.type === 'heavy_ap' ? 'Dano muito concentrado em AP' : warning.type === 'heavy_ad' ? 'Dano muito concentrado em AD' : 'Poucos dealers de dano identificados'}
                      >
                        <span>{warning.icon}</span>
                        <span>{warning.label}</span>
                      </span>
                    );
                  }
                  return null;
                })()}
                {getTopCompTypes(composition.red).length === 0 && !getDamageWarning(composition.red) && (
                  <span className="text-[10px] text-zinc-500">Comp balanceada</span>
                )}
              </div>
            </div>
          </div>
        )}

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

            {/* Key Factors - Fatores Decisivos */}
            {hasTeamContext && (
              <div className="pt-2">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Fatores Decisivos</p>
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
