import { memo } from 'react';
import { SynergyPair } from '@/types';
import { cn } from '@/lib/utils';

interface SynergiesPanelProps {
  synergies: { blue: SynergyPair[]; red: SynergyPair[] };
}

function SynergiesPanelComponent({ synergies }: SynergiesPanelProps) {
  const hasBlueSyn = synergies.blue.length > 0;
  const hasRedSyn = synergies.red.length > 0;

  if (!hasBlueSyn && !hasRedSyn) return null;

  const renderPairs = (pairs: SynergyPair[], side: 'blue' | 'red') => (
    <div className="space-y-0.5">
      {pairs.map((p, i) => {
        // > 50% = good synergy (team color), < 50% = bad synergy (opposite color)
        const isGood = p.win_rate > 50;
        const isBad = p.win_rate < 50;
        const colorClass = isGood
          ? (side === 'blue' ? 'text-blue-400' : 'text-red-400')
          : isBad
          ? (side === 'blue' ? 'text-red-400' : 'text-blue-400')
          : 'text-zinc-500';

        return (
          <div key={i} className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-0.5 min-w-0 truncate">
              <span className="font-medium text-zinc-300">{p.champion1}</span>
              <span className="text-zinc-600">+</span>
              <span className="font-medium text-zinc-300">{p.champion2}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-1">
              <span className={cn('font-bold tabular-nums', colorClass)}>
                {p.win_rate}%
              </span>
              <span className="text-[9px] text-zinc-600 tabular-nums">{p.games}g</span>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
      <p className="text-[10px] font-semibold text-zinc-500 mb-2">
        Sinergias do Draft
      </p>
      <div className="grid grid-cols-2 gap-3">
        {hasBlueSyn && (
          <div>
            <p className="text-[9px] font-bold text-blue-400 uppercase mb-1">Blue</p>
            {renderPairs(synergies.blue, 'blue')}
          </div>
        )}
        {hasRedSyn && (
          <div>
            <p className="text-[9px] font-bold text-red-400 uppercase mb-1">Red</p>
            {renderPairs(synergies.red, 'red')}
          </div>
        )}
      </div>
      <p className="text-[8px] text-zinc-600 mt-2">g = partidas da dupla juntas</p>
    </div>
  );
}

export const SynergiesPanel = memo(SynergiesPanelComponent);
