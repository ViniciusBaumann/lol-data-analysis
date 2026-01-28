import { memo, useState, useCallback } from 'react';
import { SeriesGame } from '@/types';
import { cn } from '@/lib/utils';
import { LiveDot } from './LiveDot';
import { CompletedGameSummary } from './CompletedGameSummary';

interface SeriesTimelineProps {
  games: SeriesGame[];
  ddragonVersion: string;
}

function SeriesTimelineComponent({ games, ddragonVersion }: SeriesTimelineProps) {
  const [expandedGame, setExpandedGame] = useState<number | null>(null);

  const handleGameClick = useCallback((sg: SeriesGame) => {
    const isCompleted = sg.state === 'completed';
    const hasData = !!(sg.draft || sg.final_stats || sg.players);
    if (isCompleted && hasData) {
      setExpandedGame(prev => prev === sg.number ? null : sg.number);
    }
  }, []);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center gap-1.5 mb-4">
        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
          Serie
        </span>
        <div className="flex-1 h-px bg-zinc-800" />
      </div>

      <div className="flex items-center gap-2 justify-center">
        {games.map((sg) => {
          const isCompleted = sg.state === 'completed';
          const isCurrent = sg.is_current;
          const isUnstarted = sg.state === 'unstarted';
          const hasData = !!(sg.draft || sg.final_stats || sg.players);

          return (
            <button
              key={sg.number}
              onClick={() => handleGameClick(sg)}
              className={cn(
                'relative flex items-center justify-center w-12 h-12 rounded-lg text-sm font-bold transition-all',
                isCurrent && 'bg-emerald-500/20 text-emerald-400 ring-2 ring-emerald-500/50',
                isCompleted && hasData && 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 cursor-pointer',
                isCompleted && !hasData && 'bg-zinc-800/50 text-zinc-600 cursor-default',
                isUnstarted && 'bg-zinc-800/30 text-zinc-700 cursor-default',
              )}
              disabled={isUnstarted || (isCompleted && !hasData)}
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
        if (!sg || (!sg.draft && !sg.final_stats && !sg.players)) return null;

        return (
          <div className="mt-4 p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
            <CompletedGameSummary game={sg} ddragonVersion={ddragonVersion} />
          </div>
        );
      })()}
    </div>
  );
}

export const SeriesTimeline = memo(SeriesTimelineComponent);
