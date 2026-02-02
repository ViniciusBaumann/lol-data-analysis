import { useNavigate } from 'react-router-dom';
import {
  Users,
  Trophy,
  MapPin,
  ChevronRight,
} from 'lucide-react';
import { useLeagues } from '@/hooks/useLeagues';
import { Loading } from '@/components/common/Loading';

const REGION_COLORS: Record<string, string> = {
  Korea: 'from-blue-500/20 to-blue-900/10 border-blue-500/30',
  China: 'from-red-500/20 to-red-900/10 border-red-500/30',
  Europe: 'from-emerald-500/20 to-emerald-900/10 border-emerald-500/30',
  'North America': 'from-violet-500/20 to-violet-900/10 border-violet-500/30',
  Brazil: 'from-yellow-500/20 to-yellow-900/10 border-yellow-500/30',
  International: 'from-amber-500/20 to-amber-900/10 border-amber-500/30',
};

const REGION_ACCENT: Record<string, string> = {
  Korea: 'text-blue-400',
  China: 'text-red-400',
  Europe: 'text-emerald-400',
  'North America': 'text-violet-400',
  Brazil: 'text-yellow-400',
  International: 'text-amber-400',
};

function getRegionColor(region: string): string {
  return REGION_COLORS[region] || 'from-primary/20 to-primary/5 border-primary/30';
}

function getRegionAccent(region: string): string {
  return REGION_ACCENT[region] || 'text-primary';
}

export default function TeamsPage() {
  const navigate = useNavigate();
  const { data: leagues, loading } = useLeagues({ year: 2026 });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Users className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Times</h1>
          <p className="text-sm text-muted-foreground">
            Selecione uma liga para ver seus times
          </p>
        </div>
      </div>

      {/* Content */}
      {loading && <Loading />}

      {!loading && leagues.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          Nenhuma liga encontrada.
        </div>
      )}

      {!loading && leagues.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {leagues.map((league) => (
            <div
              key={league.id}
              onClick={() => navigate(`/teams/league/${league.id}`)}
              className={`
                relative bg-gradient-to-br ${getRegionColor(league.region)}
                border rounded-xl p-5 cursor-pointer
                hover:scale-[1.02] hover:shadow-lg hover:shadow-black/20
                transition-all duration-200 group
              `}
            >
              {/* League name */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Trophy
                    size={20}
                    className={getRegionAccent(league.region)}
                  />
                  <h2 className="text-base font-semibold text-foreground truncate">
                    {league.name}
                  </h2>
                </div>
                <ChevronRight
                  size={18}
                  className="text-muted-foreground shrink-0 group-hover:text-foreground group-hover:translate-x-0.5 transition-all"
                />
              </div>

              {/* Region */}
              <div className="flex items-center gap-1.5 mt-3">
                <MapPin size={13} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {league.region}
                </span>
              </div>

              {/* Match count */}
              <div className="mt-4 pt-3 border-t border-border/50">
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-2xl font-bold ${getRegionAccent(league.region)}`}>
                    {league.total_matches ?? 0}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {league.total_matches === 1 ? 'partida' : 'partidas'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
