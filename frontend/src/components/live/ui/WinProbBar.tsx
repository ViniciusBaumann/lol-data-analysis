import { memo } from 'react';

interface WinProbBarProps {
  blueProb: number;
  redProb: number;
}

function WinProbBarComponent({ blueProb, redProb }: WinProbBarProps) {
  const blueBetter = blueProb > redProb;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
      <div className="flex justify-between text-sm font-bold">
        <span className={blueBetter ? 'text-blue-400' : 'text-zinc-500'}>
          {blueProb}%
        </span>
        <span className="text-zinc-600 text-[10px] uppercase tracking-widest self-center">Win Probability</span>
        <span className={!blueBetter ? 'text-red-400' : 'text-zinc-500'}>
          {redProb}%
        </span>
      </div>
      <div className="h-3 rounded-full overflow-hidden flex bg-zinc-800">
        <div
          className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-500"
          style={{ width: `${blueProb}%` }}
        />
        <div
          className="h-full bg-gradient-to-r from-red-400 to-red-600 transition-all duration-500"
          style={{ width: `${redProb}%` }}
        />
      </div>
    </div>
  );
}

export const WinProbBar = memo(WinProbBarComponent);
