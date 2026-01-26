import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Users, Trophy, ChevronDown, ChevronRight } from 'lucide-react';
import { useStandings } from '@/hooks/useTeams';
import { FilterBar } from '@/components/common/FilterBar';
import { WinRateBar } from '@/components/common/WinRateBar';
import { Loading } from '@/components/common/Loading';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { cn } from '@/lib/utils';

export default function TeamsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [searchInput, setSearchInput] = useState(
    searchParams.get('search') || ''
  );
  const [debouncedSearch, setDebouncedSearch] = useState(
    searchParams.get('search') || ''
  );
  const [filters, setFilters] = useState<{
    league?: number;
    year?: number;
    split?: string;
  }>({
    league: searchParams.get('league')
      ? Number(searchParams.get('league'))
      : undefined,
    year: searchParams.get('year')
      ? Number(searchParams.get('year'))
      : undefined,
    split: searchParams.get('split') || undefined,
  });
  const [expandedLeagues, setExpandedLeagues] = useState<Set<number>>(
    new Set()
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const params: Record<string, string> = {};
    if (debouncedSearch) params.search = debouncedSearch;
    if (filters.league) params.league = String(filters.league);
    if (filters.year) params.year = String(filters.year);
    if (filters.split) params.split = filters.split;
    setSearchParams(params, { replace: true });
  }, [debouncedSearch, filters, setSearchParams]);

  const { data, loading, error } = useStandings({
    league: filters.league,
    year: filters.year,
    split: filters.split,
    search: debouncedSearch || undefined,
  });

  // Auto-expand all leagues when data loads or filters change
  useEffect(() => {
    if (data.length > 0) {
      setExpandedLeagues(new Set(data.map((s) => s.league.id)));
    }
  }, [data]);

  function handleFilterChange(newFilters: {
    league?: number;
    year?: number;
    split?: string;
  }) {
    setFilters(newFilters);
  }

  function toggleLeague(leagueId: number) {
    setExpandedLeagues((prev) => {
      const next = new Set(prev);
      if (next.has(leagueId)) {
        next.delete(leagueId);
      } else {
        next.add(leagueId);
      }
      return next;
    });
  }

  const totalTeams = data.reduce((sum, s) => sum + s.teams.length, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Users className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Times</h1>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            placeholder="Buscar time..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full bg-secondary border border-border rounded-lg pl-9 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <FilterBar filters={filters} onChange={handleFilterChange} />
      </div>

      {/* Content */}
      {loading && <Loading />}
      {error && <ErrorMessage message={error} />}

      {!loading && !error && (
        <>
          <p className="text-sm text-muted-foreground">
            {totalTeams} {totalTeams === 1 ? 'time' : 'times'} em{' '}
            {data.length} {data.length === 1 ? 'liga' : 'ligas'}
          </p>

          {data.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum time encontrado com os filtros selecionados.
            </div>
          ) : (
            <div className="space-y-4">
              {data.map((standing) => {
                const isExpanded = expandedLeagues.has(standing.league.id);

                return (
                  <div
                    key={standing.league.id}
                    className="bg-card border border-border rounded-lg overflow-hidden"
                  >
                    {/* League Header */}
                    <button
                      onClick={() => toggleLeague(standing.league.id)}
                      className="w-full px-5 py-3 border-b border-border bg-secondary/40 flex items-center gap-2 hover:bg-secondary/60 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown size={16} className="text-muted-foreground" />
                      ) : (
                        <ChevronRight size={16} className="text-muted-foreground" />
                      )}
                      <Trophy size={16} className="text-primary" />
                      <h2 className="text-sm font-semibold text-foreground">
                        {standing.league.name}
                      </h2>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {standing.teams.length}{' '}
                        {standing.teams.length === 1 ? 'time' : 'times'}
                      </span>
                    </button>

                    {/* Standings Table */}
                    {isExpanded && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border text-muted-foreground">
                              <th className="text-center py-3 px-3 font-medium w-12">
                                #
                              </th>
                              <th className="text-left py-3 px-3 font-medium">
                                Time
                              </th>
                              <th className="text-center py-3 px-3 font-medium">
                                J
                              </th>
                              <th className="text-center py-3 px-3 font-medium">
                                V
                              </th>
                              <th className="text-center py-3 px-3 font-medium">
                                D
                              </th>
                              <th className="text-left py-3 px-3 font-medium min-w-[160px]">
                                Win Rate
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {standing.teams.map((team, index) => (
                              <tr
                                key={team.id}
                                onClick={() => navigate(`/teams/${team.id}`)}
                                className={cn(
                                  'border-b border-border/50 hover:bg-secondary/50 transition-colors cursor-pointer',
                                  index < 3 && 'bg-primary/[0.03]'
                                )}
                              >
                                <td className="py-3 px-3 text-center">
                                  <span
                                    className={cn(
                                      'inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold',
                                      index === 0 &&
                                        'bg-yellow-500/20 text-yellow-400',
                                      index === 1 &&
                                        'bg-gray-400/20 text-gray-300',
                                      index === 2 &&
                                        'bg-amber-700/20 text-amber-600',
                                      index > 2 && 'text-muted-foreground'
                                    )}
                                  >
                                    {index + 1}
                                  </span>
                                </td>
                                <td className="py-3 px-3">
                                  <span className="font-medium text-foreground hover:text-primary transition-colors">
                                    {team.name}
                                  </span>
                                  {team.short_name && (
                                    <span className="text-muted-foreground ml-2 text-xs">
                                      ({team.short_name})
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-center text-muted-foreground">
                                  {team.total_matches}
                                </td>
                                <td className="py-3 px-3 text-center text-green-400 font-medium">
                                  {team.wins}
                                </td>
                                <td className="py-3 px-3 text-center text-red-400 font-medium">
                                  {team.losses}
                                </td>
                                <td className="py-3 px-3">
                                  <WinRateBar winRate={team.win_rate} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
