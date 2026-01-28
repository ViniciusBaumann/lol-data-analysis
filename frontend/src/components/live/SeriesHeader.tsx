import { cn } from '@/lib/utils';
import { LiveGame } from '@/types';

interface SeriesHeaderProps {
  game: LiveGame;
}

export function SeriesHeader({ game }: SeriesHeaderProps) {
  const blueWins = game.blue_team.result?.gameWins ?? 0;
  const redWins = game.red_team.result?.gameWins ?? 0;
  const count = game.strategy.count || 1;
  const isBo = count > 1;

  if (!isBo) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-6 py-5">
      <div className="flex items-center justify-center gap-8">
        {/* Blue team */}
        <div className="flex items-center gap-4">
          {game.blue_team.image && (
            <img
              src={game.blue_team.image}
              alt={game.blue_team.code}
              className="h-12 w-12 object-contain"
            />
          )}
          <span className="text-lg font-bold text-blue-400">{game.blue_team.code}</span>
        </div>

        {/* Score */}
        <div className="flex items-center gap-4 px-6">
          <span
            className={cn(
              'text-4xl font-black tabular-nums transition-colors',
              blueWins > redWins ? 'text-blue-400' : 'text-zinc-400',
            )}
          >
            {blueWins}
          </span>
          <div className="flex flex-col items-center">
            <span className="text-zinc-600 font-bold text-lg">:</span>
            <span className="text-[10px] text-zinc-600 uppercase tracking-widest">
              Bo{count}
            </span>
          </div>
          <span
            className={cn(
              'text-4xl font-black tabular-nums transition-colors',
              redWins > blueWins ? 'text-red-400' : 'text-zinc-400',
            )}
          >
            {redWins}
          </span>
        </div>

        {/* Red team */}
        <div className="flex items-center gap-4">
          <span className="text-lg font-bold text-red-400">{game.red_team.code}</span>
          {game.red_team.image && (
            <img
              src={game.red_team.image}
              alt={game.red_team.code}
              className="h-12 w-12 object-contain"
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default SeriesHeader;
