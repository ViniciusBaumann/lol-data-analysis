import { memo } from 'react';
import { Loader2 } from 'lucide-react';
import { LiveGame, DraftPoolChampion } from '@/types';
import { LiveDot } from '../ui/LiveDot';

const POSITIONS = ['top', 'jng', 'mid', 'bot', 'sup'] as const;
const POS_LABELS: Record<string, string> = {
  top: 'TOP', jng: 'JNG', mid: 'MID', bot: 'BOT', sup: 'SUP',
};

interface AwaitingStartPanelProps {
  game: LiveGame;
}

function ChampionPool({
  champions,
  side,
  ddVer,
}: {
  champions: DraftPoolChampion[];
  side: 'blue' | 'red';
  ddVer: string;
}) {
  if (!champions.length) {
    return <span className="text-zinc-700 text-[10px]">-</span>;
  }

  const isBlue = side === 'blue';

  return (
    <div className={`flex items-center gap-1 ${isBlue ? 'justify-end' : 'justify-start'}`}>
      {(isBlue ? champions : champions).map((c) => (
        <div
          key={c.champion}
          className="flex flex-col items-center"
          title={`${c.champion}: ${c.games} jogos, ${c.wins}V ${c.games - c.wins}D (${c.win_rate}% WR)`}
        >
          <img
            src={`https://ddragon.leagueoflegends.com/cdn/${ddVer}/img/champion/${c.champion}.png`}
            alt={c.champion}
            className="h-7 w-7 rounded border border-zinc-700"
          />
          <span className="text-[8px] text-zinc-500 tabular-nums leading-none mt-0.5">
            {c.games}g
          </span>
          <span
            className={`text-[8px] tabular-nums leading-none ${
              c.win_rate >= 55 ? (isBlue ? 'text-blue-400' : 'text-red-400') :
              c.win_rate <= 45 ? 'text-zinc-600' : 'text-zinc-500'
            }`}
          >
            {c.win_rate}%
          </span>
        </div>
      ))}
    </div>
  );
}

function AwaitingStartPanelComponent({ game }: AwaitingStartPanelProps) {
  const pools = game.draft_pools;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-4 sm:px-6 sm:py-6">
      <div className="flex flex-col items-center justify-center gap-4">
        {/* Teams header */}
        <div className="flex items-center gap-3 sm:gap-6 mb-2">
          <div className="flex items-center gap-2">
            {game.blue_team.image && (
              <img src={game.blue_team.image} alt="" className="h-8 w-8 sm:h-10 sm:w-10 object-contain" />
            )}
            <span className="text-sm sm:text-lg font-bold text-blue-400">{game.blue_team.code}</span>
          </div>
          <span className="text-zinc-600 font-bold text-sm sm:text-base">vs</span>
          <div className="flex items-center gap-2">
            <span className="text-sm sm:text-lg font-bold text-red-400">{game.red_team.code}</span>
            {game.red_team.image && (
              <img src={game.red_team.image} alt="" className="h-8 w-8 sm:h-10 sm:w-10 object-contain" />
            )}
          </div>
        </div>

        {/* Champion pools by position */}
        {pools && (
          <div className="w-full max-w-2xl">
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 text-center">
              Pool de Campeoes por Posicao
            </p>

            <div className="space-y-2">
              {POSITIONS.map((pos) => {
                const blueChamps = pools.blue[pos] || [];
                const redChamps = pools.red[pos] || [];

                return (
                  <div key={pos} className="flex items-center gap-2">
                    {/* Blue side */}
                    <div className="flex-1 min-w-0">
                      <ChampionPool
                        champions={blueChamps}
                        side="blue"
                        ddVer={game.ddragon_version}
                      />
                    </div>

                    {/* Position label */}
                    <div className="w-8 shrink-0 text-center">
                      <span className="text-[9px] font-bold text-zinc-600 uppercase">
                        {POS_LABELS[pos]}
                      </span>
                    </div>

                    {/* Red side */}
                    <div className="flex-1 min-w-0">
                      <ChampionPool
                        champions={redChamps}
                        side="red"
                        ddVer={game.ddragon_version}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-[8px] text-zinc-600 mt-2 text-center">
              Campeoes mais jogados pelo time nesta posicao (historico)
            </p>
          </div>
        )}

        {/* Spinner */}
        <div className="relative mt-2">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
        </div>

        {/* Message */}
        <div className="text-center">
          <p className="text-sm font-medium text-zinc-300">Aguardando inicio do draft</p>
          <p className="text-xs text-zinc-600 mt-1">Os dados serao exibidos assim que o draft terminar</p>
        </div>

        {/* Live indicator */}
        <div className="flex items-center gap-2 mt-1">
          <LiveDot />
          <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Ao Vivo</span>
        </div>
      </div>
    </div>
  );
}

export const AwaitingStartPanel = memo(AwaitingStartPanelComponent);
