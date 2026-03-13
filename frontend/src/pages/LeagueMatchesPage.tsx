import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  Clock,
  Calendar,
  CalendarClock,
  Radio,
  Trophy,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useMatches } from '@/hooks/useMatches';
import { useLeagues, useLeagueSchedule } from '@/hooks/useLeagues';
import { useEloRatings } from '@/hooks/useElo';
import { Loading } from '@/components/common/Loading';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { Pagination } from '@/components/common/Pagination';
import { cn } from '@/lib/utils';
import type { Match, ScheduledMatch } from '@/types';

const PAGE_SIZE = 20;

function formatDuration(minutes: number | null): string {
  if (minutes === null || minutes === 0) return '--';
  const mins = Math.floor(minutes);
  const secs = Math.round((minutes - mins) * 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '--';
  try {
    return format(new Date(dateStr), 'HH:mm');
  } catch {
    return '--';
  }
}

function getDayKey(dateStr: string | null): string {
  if (!dateStr) return 'sem-data';
  try {
    return format(new Date(dateStr), 'yyyy-MM-dd');
  } catch {
    return 'sem-data';
  }
}

function formatDayLabel(dateStr: string | null): string {
  if (!dateStr) return 'Sem data';
  try {
    return format(new Date(dateStr), "EEEE, dd 'de' MMMM 'de' yyyy", {
      locale: ptBR,
    });
  } catch {
    return 'Sem data';
  }
}

function ChangeIndicator({ value }: { value: number }) {
  if (value === 0) return <span className="text-muted-foreground">--</span>;
  const isPositive = value > 0;
  const Icon = isPositive ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-medium',
        isPositive ? 'text-green-400' : 'text-red-400'
      )}
    >
      <Icon size={12} />
      {isPositive ? '+' : ''}
      {value.toFixed(1)}
    </span>
  );
}

export default function LeagueMatchesPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const { data: leagues } = useLeagues();
  const league = leagues.find((l) => l.id === Number(leagueId));

  const { data: scheduleEvents, loading: scheduleLoading } = useLeagueSchedule(
    leagueId ? Number(leagueId) : null
  );

  const [activeTab, setActiveTab] = useState<'matches' | 'elo'>('matches');

  const [searchInput, setSearchInput] = useState(
    searchParams.get('search') || ''
  );
  const [debouncedSearch, setDebouncedSearch] = useState(
    searchParams.get('search') || ''
  );
  const [filters, setFilters] = useState<{
    year?: number;
    split?: string;
  }>({
    year: searchParams.get('year')
      ? Number(searchParams.get('year'))
      : undefined,
    split: searchParams.get('split') || undefined,
  });
  const [page, setPage] = useState(
    searchParams.get('page') ? Number(searchParams.get('page')) : 1
  );
  const [ordering, setOrdering] = useState<string>(
    searchParams.get('ordering') || '-date'
  );

  // Fetch ELO only when tab is active
  const { data: eloRatings, loading: eloLoading, error: eloError } = useEloRatings(
    activeTab === 'elo' ? Number(leagueId) : null
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (filters.year) params.set('year', String(filters.year));
    if (filters.split) params.set('split', filters.split);
    if (page > 1) params.set('page', String(page));
    if (ordering && ordering !== '-date') params.set('ordering', ordering);
    navigate({ search: params.toString() }, { replace: true });
  }, [debouncedSearch, filters, page, ordering, navigate]);

  const { data, loading, error } = useMatches({
    league: Number(leagueId),
    year: filters.year,
    split: filters.split,
    search: debouncedSearch || undefined,
    page,
    ordering,
  });

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 1;

  const groupedByDay = useMemo(() => {
    if (!data?.results) return [];
    const groups: { key: string; label: string; date: string | null; matches: Match[] }[] = [];
    const map = new Map<string, { label: string; date: string | null; matches: Match[] }>();

    for (const match of data.results) {
      const key = getDayKey(match.date);
      if (!map.has(key)) {
        const entry = { label: formatDayLabel(match.date), date: match.date, matches: [] as Match[] };
        map.set(key, entry);
      }
      map.get(key)!.matches.push(match);
    }

    for (const [key, value] of map) {
      groups.push({ key, ...value });
    }
    return groups;
  }, [data]);

  const scheduledByDay = useMemo(() => {
    if (!scheduleEvents.length) return [];
    const groups: { key: string; label: string; events: ScheduledMatch[] }[] = [];
    const map = new Map<string, { label: string; events: ScheduledMatch[] }>();

    for (const ev of scheduleEvents) {
      const key = getDayKey(ev.startTime);
      if (!map.has(key)) {
        const entry = { label: formatDayLabel(ev.startTime), events: [] as ScheduledMatch[] };
        map.set(key, entry);
      }
      map.get(key)!.events.push(ev);
    }

    for (const [key, value] of map) {
      groups.push({ key, ...value });
    }
    return groups;
  }, [scheduleEvents]);

  function toggleDateOrdering() {
    setOrdering((prev) => (prev === '-date' ? 'date' : '-date'));
    setPage(1);
  }

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

  const DateSortIcon =
    ordering === '-date'
      ? ArrowDown
      : ordering === 'date'
        ? ArrowUp
        : ArrowUpDown;

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/matches')}
          className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={20} />
        </button>
        <Trophy className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {league?.name || 'Liga'}
          </h1>
          {league?.region && (
            <p className="text-sm text-muted-foreground">{league.region}</p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setActiveTab('matches')}
          className={cn(
            'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
            activeTab === 'matches'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          Partidas
        </button>
        <button
          onClick={() => setActiveTab('elo')}
          className={cn(
            'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
            activeTab === 'elo'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          ELO Ranking
        </button>
      </div>

      {/* === ELO Tab === */}
      {activeTab === 'elo' && (
        <>
          {eloLoading && <Loading />}
          {eloError && <ErrorMessage message={eloError} />}
          {!eloLoading && !eloError && eloRatings.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum dado de ELO disponivel para esta liga.
            </div>
          )}
          {!eloLoading && !eloError && eloRatings.length > 0 && (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/40">
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground w-12">
                        #
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                        Time
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                        ELO
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-blue-400">
                        Blue
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-red-400">
                        Red
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                        Var.
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground hidden sm:table-cell">
                        Partidas
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {eloRatings.map((entry) => (
                      <tr
                        key={entry.team.id}
                        onClick={() => navigate(`/teams/${entry.team.id}`)}
                        className="hover:bg-secondary/30 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                          {entry.rank}
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">
                          {entry.team.short_name || entry.team.name}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-foreground">
                          {Math.round(entry.elo_rating)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-blue-400">
                          {Math.round(entry.elo_rating_blue)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-red-400">
                          {Math.round(entry.elo_rating_red)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <ChangeIndicator value={entry.last_change} />
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground hidden sm:table-cell">
                          {entry.matches_played}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* === Matches Tab === */}
      {activeTab === 'matches' && (
        <>
          {/* Search + Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1 max-w-md">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="text"
                placeholder="Buscar por time..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full bg-secondary border border-border rounded-lg pl-9 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <select
                value={filters.year || ''}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    year: e.target.value ? Number(e.target.value) : undefined,
                  }))
                }
                className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Todos os anos</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>

              <select
                value={filters.split || ''}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    split: e.target.value || undefined,
                  }))
                }
                className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Todos os splits</option>
                <option value="Spring">Spring</option>
                <option value="Summer">Summer</option>
                <option value="Winter">Winter</option>
              </select>
            </div>
          </div>

          {/* Sort control */}
          <div className="flex items-center gap-4">
            <button
              onClick={toggleDateOrdering}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Ordenar por data
              <DateSortIcon size={14} />
            </button>
            {data && (
              <p className="text-sm text-muted-foreground">
                {data.count}{' '}
                {data.count === 1 ? 'partida encontrada' : 'partidas encontradas'}
              </p>
            )}
          </div>

          {/* Upcoming / Live Matches */}
          {scheduledByDay.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CalendarClock size={18} className="text-primary" />
                <h2 className="text-lg font-semibold text-foreground">
                  Proximas Partidas
                </h2>
              </div>

              {scheduledByDay.map((day) => (
                <div
                  key={`sched-${day.key}`}
                  className="bg-card border border-border rounded-lg overflow-hidden"
                >
                  {/* Day header */}
                  <div className="px-5 py-2.5 border-b border-border bg-secondary/40 flex items-center gap-2">
                    <Calendar size={14} className="text-primary" />
                    <span className="text-sm font-medium text-foreground capitalize">
                      {day.label}
                    </span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {day.events.length}{' '}
                      {day.events.length === 1 ? 'partida' : 'partidas'}
                    </span>
                  </div>

                  {/* Events */}
                  <div className="divide-y divide-border/50">
                    {day.events.map((ev, idx) => {
                      const team1 = ev.match.teams[0];
                      const team2 = ev.match.teams[1];
                      const isLive = ev.state === 'inProgress';
                      const bestOf = ev.match.strategy?.count;

                      const canCompare =
                        team1?.name && team2?.name &&
                        team1.name !== 'TBD' && team2.name !== 'TBD';

                      return (
                        <div
                          key={`${ev.match.id}-${idx}`}
                          onClick={() => {
                            if (canCompare) {
                              navigate(
                                `/compare?team1=${encodeURIComponent(team1!.name)}&team2=${encodeURIComponent(team2!.name)}`
                              );
                            }
                          }}
                          className={`flex items-center gap-3 px-5 py-3${canCompare ? ' hover:bg-secondary/30 transition-colors cursor-pointer' : ''}`}
                        >
                          {/* Time or LIVE badge */}
                          <span className="w-14 shrink-0 text-center">
                            {isLive ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-red-500">
                                <Radio size={12} className="animate-pulse" />
                                AO VIVO
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {formatTime(ev.startTime)}
                              </span>
                            )}
                          </span>

                          {/* Team 1 */}
                          <div className="flex-1 flex items-center justify-end gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {team1?.code || team1?.name || 'TBD'}
                            </span>
                            {team1?.image && (
                              <img
                                src={team1.image}
                                alt={team1.code}
                                className="w-6 h-6 object-contain"
                              />
                            )}
                          </div>

                          {/* Score / VS */}
                          <div className="w-16 text-center shrink-0">
                            {isLive && team1?.result && team2?.result ? (
                              <span className="text-sm font-bold text-foreground">
                                {team1.result.gameWins} - {team2.result.gameWins}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                vs
                              </span>
                            )}
                          </div>

                          {/* Team 2 */}
                          <div className="flex-1 flex items-center gap-2">
                            {team2?.image && (
                              <img
                                src={team2.image}
                                alt={team2.code}
                                className="w-6 h-6 object-contain"
                              />
                            )}
                            <span className="text-sm font-medium text-foreground">
                              {team2?.code || team2?.name || 'TBD'}
                            </span>
                          </div>

                          {/* Best of N */}
                          {bestOf && (
                            <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                              Bo{bestOf}
                            </span>
                          )}

                          {/* Block name */}
                          {ev.blockName && (
                            <span className="text-xs text-muted-foreground shrink-0 hidden md:block max-w-[100px] truncate">
                              {ev.blockName}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Separator between upcoming and history */}
              <div className="border-t border-border" />
            </div>
          )}

          {/* Content */}
          {loading && <Loading />}
          {error && <ErrorMessage message={error} />}

          {!loading && !error && data && (
            <>
              {data.results.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  Nenhuma partida encontrada com os filtros selecionados.
                </div>
              ) : (
                <div className="space-y-4">
                  {groupedByDay.map((day) => (
                    <div
                      key={day.key}
                      className="bg-card border border-border rounded-lg overflow-hidden"
                    >
                      {/* Day header */}
                      <div className="px-5 py-2.5 border-b border-border bg-secondary/40 flex items-center gap-2">
                        <Calendar size={14} className="text-primary" />
                        <span className="text-sm font-medium text-foreground capitalize">
                          {day.label}
                        </span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {day.matches.length}{' '}
                          {day.matches.length === 1 ? 'partida' : 'partidas'}
                        </span>
                      </div>

                      {/* Matches for this day */}
                      <div className="divide-y divide-border/50">
                        {day.matches.map((match) => {
                          const blueWon = match.winner?.id === match.blue_team.id;
                          const redWon = match.winner?.id === match.red_team.id;

                          return (
                            <div
                              key={match.id}
                              onClick={() => navigate(`/compare?team1=${match.blue_team.id}&team2=${match.red_team.id}`)}
                              className="flex items-center gap-3 px-5 py-3 hover:bg-secondary/30 transition-colors cursor-pointer"
                            >
                              {/* Time */}
                              <span className="text-xs text-muted-foreground w-10 shrink-0">
                                {formatTime(match.date)}
                              </span>

                              {/* Blue team */}
                              <div className="flex-1 text-right">
                                <span
                                  className={cn(
                                    'text-sm font-medium',
                                    blueWon
                                      ? 'text-blue-400'
                                      : 'text-muted-foreground'
                                  )}
                                >
                                  {match.blue_team.short_name ||
                                    match.blue_team.name}
                                </span>
                              </div>

                              {/* Score / VS */}
                              <div className="w-16 text-center shrink-0">
                                {match.winner ? (
                                  <span className="text-xs font-bold">
                                    <span
                                      className={
                                        blueWon
                                          ? 'text-blue-400'
                                          : 'text-muted-foreground'
                                      }
                                    >
                                      {blueWon ? 'W' : 'L'}
                                    </span>
                                    <span className="text-border mx-1">-</span>
                                    <span
                                      className={
                                        redWon
                                          ? 'text-red-400'
                                          : 'text-muted-foreground'
                                      }
                                    >
                                      {redWon ? 'W' : 'L'}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    vs
                                  </span>
                                )}
                              </div>

                              {/* Red team */}
                              <div className="flex-1 text-left">
                                <span
                                  className={cn(
                                    'text-sm font-medium',
                                    redWon
                                      ? 'text-red-400'
                                      : 'text-muted-foreground'
                                  )}
                                >
                                  {match.red_team.short_name ||
                                    match.red_team.name}
                                </span>
                              </div>

                              {/* Duration */}
                              <span className="text-xs text-muted-foreground w-12 text-right shrink-0 hidden md:block">
                                <Clock size={10} className="inline mr-1" />
                                {formatDuration(match.game_length)}
                              </span>

                              {/* Patch */}
                              {match.patch && (
                                <span className="text-xs text-muted-foreground w-12 text-right shrink-0 hidden lg:block">
                                  {match.patch}
                                </span>
                              )}

                              {/* Playoffs badge */}
                              {match.playoffs && (
                                <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-500/20 text-amber-400 shrink-0">
                                  PO
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Pagination
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
