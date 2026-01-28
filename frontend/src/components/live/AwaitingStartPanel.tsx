import { memo } from 'react';
import { Loader2 } from 'lucide-react';
import { LiveGame } from '@/types';
import { LiveDot } from './LiveDot';

interface AwaitingStartPanelProps {
  game: LiveGame;
}

function AwaitingStartPanelComponent({ game }: AwaitingStartPanelProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-6 py-16">
      <div className="flex flex-col items-center justify-center gap-4">
        {/* Teams header */}
        <div className="flex items-center gap-6 mb-4">
          <div className="flex items-center gap-2">
            {game.blue_team.image && (
              <img src={game.blue_team.image} alt="" className="h-10 w-10 object-contain" />
            )}
            <span className="text-lg font-bold text-blue-400">{game.blue_team.code}</span>
          </div>
          <span className="text-zinc-600 font-bold">vs</span>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-red-400">{game.red_team.code}</span>
            {game.red_team.image && (
              <img src={game.red_team.image} alt="" className="h-10 w-10 object-contain" />
            )}
          </div>
        </div>

        {/* Spinner */}
        <div className="relative">
          <Loader2 className="h-10 w-10 animate-spin text-emerald-500" />
        </div>

        {/* Message */}
        <div className="text-center">
          <p className="text-sm font-medium text-zinc-300">Aguardando inicio da partida</p>
          <p className="text-xs text-zinc-600 mt-1">Os dados serao exibidos assim que o draft terminar</p>
        </div>

        {/* Live indicator */}
        <div className="flex items-center gap-2 mt-2">
          <LiveDot />
          <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Ao Vivo</span>
        </div>
      </div>
    </div>
  );
}

export const AwaitingStartPanel = memo(AwaitingStartPanelComponent);
