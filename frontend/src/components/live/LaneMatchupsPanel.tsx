import { memo } from 'react';
import { LaneMatchup } from '@/types';
import { cn } from '@/lib/utils';

const ROLE_LABELS: Record<string, string> = {
  top: 'TOP', jng: 'JNG', mid: 'MID', bot: 'BOT', sup: 'SUP',
};

interface LaneMatchupsPanelProps {
  matchups: LaneMatchup[];
}

function LaneMatchupsPanelComponent({ matchups }: LaneMatchupsPanelProps) {
  const hasAnyPlayerStats = matchups.some(mu => mu.blue_player_stats || mu.red_player_stats);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 h-full">
      <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
        Matchups por Lane
      </p>

      <div className="space-y-1.5">
        {matchups.map((mu) => {
          const hasData = mu.games > 0 && mu.blue_win_rate !== null;
          const blueAdv = hasData && mu.blue_wins > mu.red_wins;
          const redAdv = hasData && mu.red_wins > mu.blue_wins;
          const bluePs = mu.blue_player_stats;
          const redPs = mu.red_player_stats;

          return (
            <div key={mu.position} className="space-y-0.5">
              {/* Main matchup row */}
              <div className="flex items-center gap-1 text-[11px]">
                {/* Blue champion */}
                <div className={cn(
                  'flex-1 text-right font-medium truncate',
                  blueAdv ? 'text-blue-400' : 'text-zinc-400',
                )}>
                  {mu.blue_champion}
                </div>

                {/* Blue W/L + Games */}
                <div className="w-16 text-center">
                  {hasData ? (
                    <span className={cn('font-bold tabular-nums', blueAdv ? 'text-blue-400' : 'text-zinc-500')}>
                      {mu.blue_wins}/{mu.red_wins}
                      <span className="text-zinc-600 font-normal ml-0.5 text-[9px]">{mu.games}g</span>
                    </span>
                  ) : (
                    <span className="text-zinc-700">-</span>
                  )}
                </div>

                {/* Position */}
                <div className="w-8 text-center shrink-0">
                  <span className="text-[9px] font-bold text-zinc-600 uppercase">
                    {ROLE_LABELS[mu.position] || mu.position}
                  </span>
                </div>

                {/* Red W/L + Games */}
                <div className="w-16 text-center">
                  {hasData ? (
                    <span className={cn('font-bold tabular-nums', redAdv ? 'text-red-400' : 'text-zinc-500')}>
                      {mu.red_wins}/{mu.blue_wins}
                      <span className="text-zinc-600 font-normal ml-0.5 text-[9px]">{mu.games}g</span>
                    </span>
                  ) : (
                    <span className="text-zinc-700">-</span>
                  )}
                </div>

                {/* Red champion */}
                <div className={cn(
                  'flex-1 text-left font-medium truncate',
                  redAdv ? 'text-red-400' : 'text-zinc-400',
                )}>
                  {mu.red_champion}
                </div>
              </div>

              {/* Player stats row (if any player has stats) */}
              {(bluePs || redPs) && (
                <div className="flex items-center gap-1 text-[9px]">
                  {/* Blue player stats */}
                  <div className="flex-1 text-right">
                    {bluePs ? (
                      <span className="text-zinc-500">
                        <span className={cn(
                          'font-medium',
                          bluePs.win_rate >= 50 ? 'text-blue-400/70' : 'text-zinc-500'
                        )}>
                          {bluePs.win_rate}%
                        </span>
                        <span className="text-zinc-600 ml-0.5">{bluePs.games}g</span>
                      </span>
                    ) : (
                      <span className="text-zinc-700">-</span>
                    )}
                  </div>

                  {/* Spacer for W/L column */}
                  <div className="w-16" />

                  {/* Player label */}
                  <div className="w-8 text-center shrink-0">
                    <span className="text-[8px] text-zinc-700">player</span>
                  </div>

                  {/* Spacer for W/L column */}
                  <div className="w-16" />

                  {/* Red player stats */}
                  <div className="flex-1 text-left">
                    {redPs ? (
                      <span className="text-zinc-500">
                        <span className={cn(
                          'font-medium',
                          redPs.win_rate >= 50 ? 'text-red-400/70' : 'text-zinc-500'
                        )}>
                          {redPs.win_rate}%
                        </span>
                        <span className="text-zinc-600 ml-0.5">{redPs.games}g</span>
                      </span>
                    ) : (
                      <span className="text-zinc-700">-</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[8px] text-zinc-600 mt-2">
        V/D = Vitorias/Derrotas no matchup | g = partidas
        {hasAnyPlayerStats && ' | player = historico do jogador com o campeao'}
      </p>
    </div>
  );
}

export const LaneMatchupsPanel = memo(LaneMatchupsPanelComponent);
