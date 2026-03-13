import { memo, useMemo } from 'react';
import { TeamContext } from '@/types';
import { cn } from '@/lib/utils';

interface TeamContextPanelProps {
  context: TeamContext;
  blueTeamCode?: string;
  redTeamCode?: string;
}

function TeamContextPanelComponent({ context, blueTeamCode, redTeamCode }: TeamContextPanelProps) {
  const { blue_team, red_team, h2h } = context;
  const hasStats = blue_team.stats && red_team.stats;

  // Check if ELO data is valid (not default 1500 for both teams)
  const hasEloData = useMemo(() => (
    blue_team.elo.global !== red_team.elo.global ||
    blue_team.elo.global !== 1500 ||
    red_team.elo.global !== 1500
  ), [blue_team.elo.global, red_team.elo.global]);

  const rows = (items: { label: string; blue: number; red: number; suffix?: string }[]) =>
    items.map((row) => {
      const blueHigher = row.blue > row.red;
      const redHigher = row.red > row.blue;
      return (
        <div key={row.label} className="flex items-center justify-between text-xs">
          <span className={cn('font-bold tabular-nums', blueHigher ? 'text-blue-400' : 'text-zinc-500')}>
            {row.blue}{row.suffix ?? ''}
          </span>
          <span className="text-[10px] text-zinc-600">{row.label}</span>
          <span className={cn('font-bold tabular-nums', redHigher ? 'text-red-400' : 'text-zinc-500')}>
            {row.red}{row.suffix ?? ''}
          </span>
        </div>
      );
    });

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-3 h-full">
      <p className="text-[10px] font-semibold text-zinc-500">
        Contexto dos Times
      </p>

      {/* ELO */}
      <div className="space-y-1">
        <p className="text-[9px] font-semibold text-zinc-600 uppercase">ELO</p>
        {hasEloData ? (
          rows([
            { label: 'Global', blue: blue_team.elo.global, red: red_team.elo.global },
            { label: 'Blue Side', blue: blue_team.elo.blue, red: red_team.elo.blue },
            { label: 'Red Side', blue: blue_team.elo.red, red: red_team.elo.red },
          ])
        ) : (
          <p className="text-[9px] text-amber-500/80">
            ELO nao disponivel (sem historico)
          </p>
        )}
      </div>

      {/* H2H */}
      {h2h.total_games > 0 && (
        <div className="space-y-1">
          <p className="text-[9px] font-semibold text-zinc-600 uppercase">
            Confronto Direto ({h2h.total_games}g)
          </p>
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-blue-400">{h2h.blue_win_rate}%</span>
            <span className="text-[9px] text-zinc-600">Win Rate</span>
            <span className="font-bold text-red-400">{h2h.red_win_rate}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden flex bg-zinc-800">
            <div className="h-full bg-blue-500 transition-all" style={{ width: `${h2h.blue_win_rate}%` }} />
            <div className="h-full bg-red-500 transition-all" style={{ width: `${h2h.red_win_rate}%` }} />
          </div>
        </div>
      )}

      {/* Recent Form */}
      <div className="space-y-1">
        <p className="text-[9px] font-semibold text-zinc-600 uppercase">Forma Recente</p>
        {hasStats ? (
          rows([
            { label: 'Win Rate', blue: blue_team.stats!.win_rate, red: red_team.stats!.win_rate, suffix: '%' },
            { label: 'Ultimos 3', blue: blue_team.stats!.win_rate_last3, red: red_team.stats!.win_rate_last3, suffix: '%' },
            { label: 'Ultimos 5', blue: blue_team.stats!.win_rate_last5, red: red_team.stats!.win_rate_last5, suffix: '%' },
          ])
        ) : (
          <p className="text-[9px] text-amber-500/80">
            Estatisticas nao disponiveis
          </p>
        )}
      </div>

      {/* Recent Matches - Match by Match */}
      {(blue_team.recent_matches?.length > 0 || red_team.recent_matches?.length > 0) && (
        <div className="space-y-2">
          <p className="text-[9px] font-semibold text-zinc-600 uppercase">Ultimas Partidas</p>
          <div className="space-y-0">
            {/* Header */}
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 pb-1 border-b border-zinc-800/50">
              <span className="text-[9px] font-medium text-blue-400 text-center">{blueTeamCode || 'Blue'}</span>
              <div className="w-px bg-zinc-800" />
              <span className="text-[9px] font-medium text-red-400 text-center">{redTeamCode || 'Red'}</span>
            </div>
            {/* Rows */}
            {Array.from({ length: 5 }, (_, idx) => {
              const m1 = blue_team.recent_matches?.[idx];
              const m2 = red_team.recent_matches?.[idx];
              return (
                <div
                  key={idx}
                  className="grid grid-cols-[1fr_auto_1fr] gap-2 py-1 border-b border-zinc-800/30 items-center"
                >
                  {/* Blue Team match */}
                  <div className="flex items-center gap-1 min-w-0">
                    {m1 ? (
                      <>
                        <span className={cn(
                          'text-[6px] font-bold px-1 py-0.5 rounded shrink-0',
                          m1.side === 'Blue'
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-red-500/20 text-red-400'
                        )}>
                          {m1.side === 'Blue' ? 'BLUE' : 'RED'}
                        </span>
                        <span className="text-[9px] text-zinc-500 truncate min-w-0 flex-1">
                          vs {m1.opponent_code}
                        </span>
                        <span className={cn(
                          'text-[8px] font-bold shrink-0',
                          m1.won ? 'text-emerald-400' : 'text-red-400'
                        )}>
                          {m1.won ? 'W' : 'L'}
                        </span>
                      </>
                    ) : (
                      <span className="text-[9px] text-zinc-700">--</span>
                    )}
                  </div>
                  {/* Separator */}
                  <div className="w-px h-3 bg-zinc-800/60" />
                  {/* Red Team match */}
                  <div className="flex items-center gap-1 min-w-0">
                    {m2 ? (
                      <>
                        <span className={cn(
                          'text-[6px] font-bold px-1 py-0.5 rounded shrink-0',
                          m2.side === 'Blue'
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-red-500/20 text-red-400'
                        )}>
                          {m2.side === 'Blue' ? 'BLUE' : 'RED'}
                        </span>
                        <span className="text-[9px] text-zinc-500 truncate min-w-0 flex-1">
                          vs {m2.opponent_code}
                        </span>
                        <span className={cn(
                          'text-[8px] font-bold shrink-0',
                          m2.won ? 'text-emerald-400' : 'text-red-400'
                        )}>
                          {m2.won ? 'W' : 'L'}
                        </span>
                      </>
                    ) : (
                      <span className="text-[9px] text-zinc-700">--</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export const TeamContextPanel = memo(TeamContextPanelComponent);
