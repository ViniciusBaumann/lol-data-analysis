import { memo } from 'react';
import { DraftPredictions, MatchPredictionEnriched } from '@/types';

interface PredictionComparisonPanelProps {
  draftPred: DraftPredictions;
  matchPred: MatchPredictionEnriched;
}

function PredictionComparisonPanelComponent({ draftPred, matchPred }: PredictionComparisonPanelProps) {
  if (matchPred.error || matchPred.blue_win_prob === undefined) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
        Comparacao de Modelos
      </p>
      <div className="grid grid-cols-2 gap-4">
        {/* Draft model */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-zinc-600 uppercase">Modelo Draft</p>
          <div className="flex justify-between text-sm font-bold">
            <span className="text-blue-400">{draftPred.blue_win_prob}%</span>
            <span className="text-red-400">{draftPred.red_win_prob}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden flex bg-zinc-800">
            <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400" style={{ width: `${draftPred.blue_win_prob}%` }} />
            <div className="h-full bg-gradient-to-r from-red-400 to-red-600" style={{ width: `${draftPred.red_win_prob}%` }} />
          </div>
        </div>

        {/* Team model */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-zinc-600 uppercase">Modelo Time</p>
          <div className="flex justify-between text-sm font-bold">
            <span className="text-blue-400">{matchPred.blue_win_prob}%</span>
            <span className="text-red-400">{matchPred.red_win_prob}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden flex bg-zinc-800">
            <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400" style={{ width: `${matchPred.blue_win_prob}%` }} />
            <div className="h-full bg-gradient-to-r from-red-400 to-red-600" style={{ width: `${matchPred.red_win_prob}%` }} />
          </div>
        </div>
      </div>

      {/* Game time estimate */}
      {matchPred.game_time && (
        <div className="mt-3 text-center">
          <span className="text-[10px] text-zinc-600">Tempo estimado: </span>
          <span className="text-xs font-bold text-zinc-300">{matchPred.game_time} min</span>
        </div>
      )}
    </div>
  );
}

export const PredictionComparisonPanel = memo(PredictionComparisonPanelComponent);
