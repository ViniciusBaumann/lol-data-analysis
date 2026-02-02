import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Search,
  ArrowLeft,
  Trophy,
  Users,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { useTeams } from '@/hooks/useTeams';
import { useLeagues } from '@/hooks/useLeagues';
import { useEloRatings } from '@/hooks/useElo';
import { Loading } from '@/components/common/Loading';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { Pagination } from '@/components/common/Pagination';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

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

export default function LeagueTeamsPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const { data: leagues } = useLeagues();
  const league = leagues.find((l) => l.id === Number(leagueId));

  const [activeTab, setActiveTab] = useState<'teams' | 'elo'>('teams');

  const [searchInput, setSearchInput] = useState(
    searchParams.get('search') || ''
  );
  const [debouncedSearch, setDebouncedSearch] = useState(
    searchParams.get('search') || ''
  );
  const [page, setPage] = useState(
    searchParams.get('page') ? Number(searchParams.get('page')) : 1
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
    if (page > 1) params.set('page', String(page));
    navigate({ search: params.toString() }, { replace: true });
  }, [debouncedSearch, page, navigate]);

  const { data, loading, error } = useTeams({
    leagues: Number(leagueId),
    search: debouncedSearch || undefined,
    page,
  });

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 1;

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/teams')}
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
          onClick={() => setActiveTab('teams')}
          className={cn(
            'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
            activeTab === 'teams'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          Times
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
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-12">
                        #
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Time
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        ELO
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-blue-400 uppercase tracking-wider">
                        Blue
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-red-400 uppercase tracking-wider">
                        Red
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Var.
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">
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

      {/* === Teams Tab === */}
      {activeTab === 'teams' && (
        <>
          {/* Search */}
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

            {data && (
              <p className="text-sm text-muted-foreground self-center">
                {data.count} {data.count === 1 ? 'time encontrado' : 'times encontrados'}
              </p>
            )}
          </div>

          {/* Content */}
          {loading && <Loading />}
          {error && <ErrorMessage message={error} />}

          {!loading && !error && data && (
            <>
              {data.results.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  Nenhum time encontrado.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {data.results.map((team) => (
                    <div
                      key={team.id}
                      onClick={() => navigate(`/teams/${team.id}`)}
                      className="bg-card border border-border rounded-lg p-4 hover:bg-secondary/30 hover:border-primary/50 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center shrink-0">
                          <Users size={18} className="text-primary" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-medium text-foreground truncate group-hover:text-primary transition-colors">
                            {team.name}
                          </h3>
                          {team.short_name && (
                            <p className="text-xs text-muted-foreground">
                              {team.short_name}
                            </p>
                          )}
                        </div>
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
