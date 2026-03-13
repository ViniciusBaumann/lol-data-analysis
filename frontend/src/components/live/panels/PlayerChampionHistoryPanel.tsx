import { memo } from 'react';
import { LaneMatchup } from '@/types';
import { cn } from '@/lib/utils';

const ROLE_LABELS: Record<string, string> = {
  top: 'TOP', jng: 'JNG', mid: 'MID', bot: 'BOT', sup: 'SUP',
};

interface PlayerChampionHistoryPanelProps {
  matchups: LaneMatchup[];
}

function PlayerChampionHistoryPanelComponent({ matchups }: PlayerChampionHistoryPanelProps) {
  // Check if we have any player stats
  const hasAnyPlayerStats = matchups.some(mu => mu.blue_player_stats || mu.red_player_stats);

  if (!hasAnyPlayerStats) {
    return null;
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 h-full">
      <p className="text-[10px] font-semibold text-zinc-500 mb-2">
        Historico Jogador + Campeao
      </p>

      <div className="space-y-1.5">
        {matchups.map((mu) => {
          const bluePs = mu.blue_player_stats;
          const redPs = mu.red_player_stats;

          // Skip if neither player has stats
          if (!bluePs && !redPs) return null;

          const blueGood = bluePs && bluePs.win_rate >= 50;
          const redGood = redPs && redPs.win_rate >= 50;

          return (
            <div key={mu.position} className="flex items-center gap-1 text-[11px]">
              {/* Blue player + champion */}
              <div className="flex-1 text-right truncate">
                {bluePs ? (
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-zinc-500 text-[10px] truncate max-w-[60px]">
                      {bluePs.player_name}
                    </span>
                    <span className={cn(
                      'font-medium',
                      blueGood ? 'text-blue-400' : 'text-zinc-400',
                    )}>
                      {mu.blue_champion}
                    </span>
                  </div>
                ) : (
                  <span className="text-zinc-600">{mu.blue_champion}</span>
                )}
              </div>

              {/* Blue stats */}
              <div className="w-20 text-center">
                {bluePs ? (
                  <div className="flex flex-col items-center leading-tight">
                    <span className={cn(
                      'font-bold tabular-nums text-[11px]',
                      blueGood ? 'text-blue-400' : 'text-zinc-500'
                    )}>
                      {bluePs.wins}V {bluePs.games - bluePs.wins}D
                      <span className="text-zinc-600 font-normal ml-0.5 text-[9px]">({bluePs.games}g)</span>
                    </span>
                    <span className={cn(
                      'text-[9px] tabular-nums',
                      blueGood ? 'text-blue-400/70' : 'text-zinc-600'
                    )}>
                      {bluePs.win_rate}% WR
                    </span>
                  </div>
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

              {/* Red stats */}
              <div className="w-20 text-center">
                {redPs ? (
                  <div className="flex flex-col items-center leading-tight">
                    <span className={cn(
                      'font-bold tabular-nums text-[11px]',
                      redGood ? 'text-red-400' : 'text-zinc-500'
                    )}>
                      {redPs.wins}V {redPs.games - redPs.wins}D
                      <span className="text-zinc-600 font-normal ml-0.5 text-[9px]">({redPs.games}g)</span>
                    </span>
                    <span className={cn(
                      'text-[9px] tabular-nums',
                      redGood ? 'text-red-400/70' : 'text-zinc-600'
                    )}>
                      {redPs.win_rate}% WR
                    </span>
                  </div>
                ) : (
                  <span className="text-zinc-700">-</span>
                )}
              </div>

              {/* Red player + champion */}
              <div className="flex-1 text-left truncate">
                {redPs ? (
                  <div className="flex items-center gap-1">
                    <span className={cn(
                      'font-medium',
                      redGood ? 'text-red-400' : 'text-zinc-400',
                    )}>
                      {mu.red_champion}
                    </span>
                    <span className="text-zinc-500 text-[10px] truncate max-w-[60px]">
                      {redPs.player_name}
                    </span>
                  </div>
                ) : (
                  <span className="text-zinc-600">{mu.red_champion}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[8px] text-zinc-600 mt-2">
        V = Vitorias, D = Derrotas do jogador com o campeao selecionado
      </p>
    </div>
  );
}

export const PlayerChampionHistoryPanel = memo(PlayerChampionHistoryPanelComponent);
