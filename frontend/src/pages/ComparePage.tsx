import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  GitCompare,
  Search,
  X,
  ChevronDown,
  Check,
  Minus,
  ArrowLeftRight,
} from 'lucide-react';
import { useCompare } from '@/hooks/useCompare';
import { usePrediction } from '@/hooks/usePrediction';
import { getTeams, getTeam } from '@/services/teams';
import {
  Team,
  MatchPredictions,
  PredictionResponse,
  CompareTeamRates,
  CompareSideStats,
  CompareMatchDetail,
  CompareFaceoffMatch,
  CompareFaceoffMatchTeam,
} from '@/types';
import { Loading } from '@/components/common/Loading';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Stat Tab Configuration
// ---------------------------------------------------------------------------

interface StatTabConfig {
  key: string;
  label: string;
  type: 'rate' | 'avg' | 'duration' | 'diff';
  rateField: keyof CompareTeamRates;
  matchField: keyof CompareMatchDetail | keyof CompareFaceoffMatchTeam;
}

const STAT_TABS: StatTabConfig[] = [
  { key: 'win_rate', label: 'Win Rate', type: 'rate', rateField: 'win_rate', matchField: 'is_winner' },
  { key: 'first_blood', label: 'First Blood', type: 'rate', rateField: 'first_blood_rate', matchField: 'first_blood' },
  { key: 'first_tower', label: 'First Tower', type: 'rate', rateField: 'first_tower_rate', matchField: 'first_tower' },
  { key: 'first_dragon', label: 'First Dragon', type: 'rate', rateField: 'first_dragon_rate', matchField: 'first_dragon' },
  { key: 'first_baron', label: 'First Nashor', type: 'rate', rateField: 'first_baron_rate', matchField: 'first_baron' },
  { key: 'avg_kills', label: 'Total Kills', type: 'avg', rateField: 'avg_kills', matchField: 'kills' },
  { key: 'avg_towers', label: 'Total Towers', type: 'avg', rateField: 'avg_towers', matchField: 'towers' },
  { key: 'avg_dragons', label: 'Total Dragons', type: 'avg', rateField: 'avg_dragons', matchField: 'dragons' },
  { key: 'avg_barons', label: 'Total Nashors', type: 'avg', rateField: 'avg_barons', matchField: 'barons' },
  { key: 'avg_game_length', label: 'Game Time', type: 'duration', rateField: 'avg_game_length', matchField: 'game_length' },
  { key: 'kill_handicap', label: 'Kill Handicap', type: 'diff', rateField: 'avg_kill_diff', matchField: 'kill_diff' },
  { key: 'tower_handicap', label: 'Tower Handicap', type: 'diff', rateField: 'avg_tower_diff', matchField: 'tower_diff' },
];

// ---------------------------------------------------------------------------
// Tab → ML Prediction field mapping
// ---------------------------------------------------------------------------

const TAB_PREDICTION_MAP: Record<string, keyof MatchPredictions> = {
  avg_kills: 'total_kills',
  avg_towers: 'total_towers',
  avg_dragons: 'total_dragons',
  avg_barons: 'total_barons',
  avg_game_length: 'game_time',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || minutes === 0) return '--';
  const mins = Math.floor(minutes);
  const secs = Math.round((minutes - mins) * 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function formatDiff(val: number): string {
  if (val > 0) return `+${val.toFixed(1)}`;
  if (val < 0) return val.toFixed(1);
  return '0.0';
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
    });
  } catch {
    return '--';
  }
}

function getStatValue(rates: CompareTeamRates, tab: StatTabConfig): string {
  const val = rates[tab.rateField];
  if (val === null || val === undefined) return '--';
  if (tab.type === 'rate') return `${val}%`;
  if (tab.type === 'duration') return formatDuration(val as number);
  if (tab.type === 'diff') return formatDiff(val as number);
  return String(val);
}

function getMatchValue(
  match: Record<string, unknown>,
  tab: StatTabConfig
): { display: string; success: boolean | null } {
  const val = match[tab.matchField as string];
  if (tab.type === 'rate') {
    return { display: '', success: val === true };
  }
  if (tab.type === 'duration') {
    return { display: formatDuration(val as number | null), success: null };
  }
  if (tab.type === 'diff') {
    const n = val as number;
    return { display: formatDiff(n), success: null };
  }
  return { display: String(val ?? '--'), success: null };
}

// ---------------------------------------------------------------------------
// Team Selector Sub-Component
// ---------------------------------------------------------------------------

interface TeamSelectorProps {
  label: string;
  selectedTeam: Team | null;
  onSelect: (team: Team) => void;
  onClear: () => void;
  accentColor: 'blue' | 'red';
}

function TeamSelector({
  label,
  selectedTeam,
  onSelect,
  onClear,
  accentColor,
}: TeamSelectorProps) {
  const [search, setSearch] = useState('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!search.trim()) {
        setTeams([]);
        return;
      }
      setLoading(true);
      getTeams({ search: search.trim(), page: 1 })
        .then((res) => setTeams(res.results))
        .catch(() => setTeams([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const borderColor =
    accentColor === 'blue' ? 'border-blue-500/50' : 'border-red-500/50';
  const accentTextColor =
    accentColor === 'blue' ? 'text-blue-400' : 'text-red-400';

  if (selectedTeam) {
    return (
      <div className={cn('bg-card border-2 rounded-lg p-4', borderColor)}>
        <div className="flex items-center justify-between mb-1">
          <span
            className={cn('text-xs font-medium uppercase', accentTextColor)}
          >
            {label}
          </span>
          <button
            onClick={() => {
              onClear();
              setSearch('');
            }}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <h3 className="text-lg font-bold text-foreground">
          {selectedTeam.name}
        </h3>
        {selectedTeam.short_name && (
          <p className="text-sm text-muted-foreground">
            {selectedTeam.short_name}
          </p>
        )}
        <div className="mt-2 text-sm text-muted-foreground">
          {selectedTeam.total_matches} partidas | WR:{' '}
          {selectedTeam.win_rate.toFixed(1)}%
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        className={cn(
          'bg-card border-2 border-dashed rounded-lg p-4',
          borderColor
        )}
      >
        <span
          className={cn(
            'text-xs font-medium uppercase block mb-2',
            accentTextColor
          )}
        >
          {label}
        </span>
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            placeholder="Buscar time..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            className="w-full bg-secondary border border-border rounded-lg pl-9 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <ChevronDown
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
        </div>
      </div>

      {open && search.trim() && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl max-h-64 overflow-y-auto">
          {loading && (
            <div className="p-3 text-sm text-muted-foreground text-center">
              Buscando...
            </div>
          )}
          {!loading && teams.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground text-center">
              Nenhum time encontrado.
            </div>
          )}
          {!loading &&
            teams.map((team) => (
              <button
                key={team.id}
                onClick={() => {
                  onSelect(team);
                  setSearch('');
                  setOpen(false);
                }}
                className="w-full text-left px-4 py-3 hover:bg-secondary/50 transition-colors border-b border-border/50 last:border-0"
              >
                <p className="text-sm font-medium text-foreground">
                  {team.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {team.short_name} | {team.total_matches} partidas |{' '}
                  {team.win_rate.toFixed(1)}% WR
                </p>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rate Bar Component
// ---------------------------------------------------------------------------

function RateBar({
  team1Value,
  team2Value,
  team1Name,
  team2Name,
  type,
}: {
  team1Value: number | null;
  team2Value: number | null;
  team1Name: string;
  team2Name: string;
  type: 'rate' | 'avg' | 'duration' | 'diff';
}) {
  const v1 = team1Value ?? 0;
  const v2 = team2Value ?? 0;

  if (type === 'rate') {
    const t1Better = v1 > v2;
    const t2Better = v2 > v1;
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className={cn('font-medium', t1Better ? 'text-blue-400' : 'text-muted-foreground')}>
            {team1Name}
          </span>
          <span className={cn('font-bold', t1Better ? 'text-blue-400' : 'text-muted-foreground')}>
            {v1}%
          </span>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', t1Better ? 'bg-blue-500' : 'bg-blue-500/40')}
            style={{ width: `${Math.min(v1, 100)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className={cn('font-medium', t2Better ? 'text-red-400' : 'text-muted-foreground')}>
            {team2Name}
          </span>
          <span className={cn('font-bold', t2Better ? 'text-red-400' : 'text-muted-foreground')}>
            {v2}%
          </span>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', t2Better ? 'bg-red-500' : 'bg-red-500/40')}
            style={{ width: `${Math.min(v2, 100)}%` }}
          />
        </div>
      </div>
    );
  }

  // avg, duration, or diff
  const t1Better = type === 'duration' ? v1 < v2 && v1 > 0 : v1 > v2;
  const t2Better = type === 'duration' ? v2 < v1 && v2 > 0 : v2 > v1;
  const displayV1 = type === 'duration' ? formatDuration(v1) : type === 'diff' ? formatDiff(v1) : v1.toFixed(1);
  const displayV2 = type === 'duration' ? formatDuration(v2) : type === 'diff' ? formatDiff(v2) : v2.toFixed(1);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className={cn('text-xs font-medium', t1Better ? 'text-blue-400' : 'text-muted-foreground')}>
          {team1Name}
        </span>
        <span className={cn('text-sm font-bold', t1Better ? 'text-blue-400' : 'text-foreground')}>
          {displayV1}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className={cn('text-xs font-medium', t2Better ? 'text-red-400' : 'text-muted-foreground')}>
          {team2Name}
        </span>
        <span className={cn('text-sm font-bold', t2Better ? 'text-red-400' : 'text-foreground')}>
          {displayV2}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Side Breakdown Bars (for "First" tabs)
// ---------------------------------------------------------------------------

const FIRST_TABS = new Set(['first_blood', 'first_tower', 'first_dragon', 'first_baron']);

function SideBreakdownBars({
  team1Stats,
  team2Stats,
  field,
  team1Name,
  team2Name,
}: {
  team1Stats: { blue: CompareSideStats; red: CompareSideStats };
  team2Stats: { blue: CompareSideStats; red: CompareSideStats };
  field: keyof CompareSideStats;
  team1Name: string;
  team2Name: string;
}) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-3">
      <SideBar sideStats={team1Stats} field={field} teamName={team1Name} accent="blue" />
      <SideBar sideStats={team2Stats} field={field} teamName={team2Name} accent="red" />
    </div>
  );
}

function SideBar({
  sideStats,
  field,
  teamName,
  accent,
}: {
  sideStats: { blue: CompareSideStats; red: CompareSideStats };
  field: keyof CompareSideStats;
  teamName: string;
  accent: 'blue' | 'red';
}) {
  const blueCount = sideStats.blue[field] as number;
  const blueTotal = sideStats.blue.total;
  const redCount = sideStats.red[field] as number;
  const redTotal = sideStats.red.total;
  const bluePct = blueTotal > 0 ? (blueCount / blueTotal) * 100 : 0;
  const redPct = redTotal > 0 ? (redCount / redTotal) * 100 : 0;

  return (
    <div className="space-y-1">
      <span className={cn('text-[10px] font-medium', accent === 'blue' ? 'text-blue-400' : 'text-red-400')}>
        {teamName}
      </span>
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] font-bold text-blue-400 w-8 shrink-0">BLUE</span>
        <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${bluePct}%` }} />
        </div>
        <span className="text-[10px] text-muted-foreground w-8 text-right shrink-0">{blueCount}/{blueTotal}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] font-bold text-red-400 w-8 shrink-0">RED</span>
        <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${redPct}%` }} />
        </div>
        <span className="text-[10px] text-muted-foreground w-8 text-right shrink-0">{redCount}/{redTotal}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Match Result Icon
// ---------------------------------------------------------------------------

function MatchIcon({ success }: { success: boolean | null }) {
  if (success === true) {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500/20 text-green-400">
        <Check size={12} />
      </span>
    );
  }
  if (success === false) {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500/20 text-red-400">
        <X size={12} />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-secondary text-muted-foreground">
      <Minus size={12} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Prediction Badge (inline within stat tabs)
// ---------------------------------------------------------------------------

function PredictionBadge({
  value,
  type,
}: {
  value: number;
  type: 'rate' | 'avg' | 'duration' | 'diff';
}) {
  const display = type === 'duration'
    ? formatDuration(value)
    : type === 'diff'
      ? formatDiff(value)
      : value.toFixed(1);

  return (
    <div className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 mb-4">
      <span className="text-sm">🔮</span>
      <span className="text-xs text-muted-foreground uppercase font-medium">
        ML Prediction
      </span>
      <span className="text-sm font-bold text-primary">{display}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prediction Card Component
// ---------------------------------------------------------------------------

function PredictionCard({
  prediction,
  loading,
}: {
  prediction: PredictionResponse | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">🔮</span>
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            Match Prediction
          </h3>
        </div>
        <div className="flex items-center justify-center py-4">
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="ml-2 text-sm text-muted-foreground">
            Computing prediction...
          </span>
        </div>
      </div>
    );
  }

  if (!prediction) return null;

  // Models not trained or insufficient data
  if (!prediction.predictions) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🔮</span>
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            Match Prediction
          </h3>
        </div>
        <div className="text-center py-4 text-muted-foreground">
          <p className="text-sm">
            {prediction.message || 'Prediction unavailable.'}
          </p>
          {!prediction.models_loaded && prediction.features_available && (
            <p className="text-xs mt-2 font-mono bg-secondary/50 inline-block px-3 py-1 rounded">
              Run: python manage.py train_prediction_model
            </p>
          )}
        </div>
      </div>
    );
  }

  const preds = prediction.predictions;
  const t1Name =
    prediction.team1_info.short_name || prediction.team1_info.name;
  const t2Name =
    prediction.team2_info.short_name || prediction.team2_info.name;
  const t1Prob = preds.team1_win_prob;
  const t2Prob = preds.team2_win_prob;

  const gameMinutes = Math.floor(preds.game_time);
  const gameSeconds = Math.round((preds.game_time - gameMinutes) * 60);
  const gameTimeFormatted = `${gameMinutes}:${String(gameSeconds).padStart(2, '0')}`;

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <div className="flex items-center gap-2 mb-5">
        <span className="text-lg">🔮</span>
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
          Match Prediction
        </h3>
      </div>

      {/* Win probability bar */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <span
            className={cn(
              'text-sm font-bold',
              t1Prob > t2Prob ? 'text-blue-400' : 'text-muted-foreground'
            )}
          >
            {t1Name}
          </span>
          <span
            className={cn(
              'text-sm font-bold',
              t2Prob > t1Prob ? 'text-red-400' : 'text-muted-foreground'
            )}
          >
            {t2Name}
          </span>
        </div>
        <div className="relative h-4 bg-secondary rounded-full overflow-hidden flex">
          <div
            className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-500"
            style={{ width: `${t1Prob}%` }}
          />
          <div
            className="h-full bg-gradient-to-r from-red-400 to-red-600 transition-all duration-500"
            style={{ width: `${t2Prob}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span
            className={cn(
              'text-xs font-bold',
              t1Prob > t2Prob ? 'text-blue-400' : 'text-muted-foreground'
            )}
          >
            {t1Prob}%
          </span>
          <span
            className={cn(
              'text-xs font-bold',
              t2Prob > t1Prob ? 'text-red-400' : 'text-muted-foreground'
            )}
          >
            {t2Prob}%
          </span>
        </div>
      </div>

      {/* Estimated stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-secondary/40 rounded-lg px-3 py-2 text-center">
          <p className="text-xs text-muted-foreground uppercase">Est. Kills</p>
          <p className="text-lg font-bold text-foreground">{preds.total_kills}</p>
        </div>
        <div className="bg-secondary/40 rounded-lg px-3 py-2 text-center">
          <p className="text-xs text-muted-foreground uppercase">Dragons</p>
          <p className="text-lg font-bold text-foreground">{preds.total_dragons}</p>
        </div>
        <div className="bg-secondary/40 rounded-lg px-3 py-2 text-center">
          <p className="text-xs text-muted-foreground uppercase">Towers</p>
          <p className="text-lg font-bold text-foreground">{preds.total_towers}</p>
        </div>
        <div className="bg-secondary/40 rounded-lg px-3 py-2 text-center">
          <p className="text-xs text-muted-foreground uppercase">Nashors</p>
          <p className="text-lg font-bold text-foreground">{preds.total_barons}</p>
        </div>
        <div className="bg-secondary/40 rounded-lg px-3 py-2 text-center">
          <p className="text-xs text-muted-foreground uppercase">Game Time</p>
          <p className="text-lg font-bold text-foreground">{gameTimeFormatted}</p>
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-muted-foreground mt-4 text-center">
        Predictions based on recent performance data. Results are estimates and
        not guarantees.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compare Page
// ---------------------------------------------------------------------------

export default function ComparePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [team1, setTeam1] = useState<Team | null>(null);
  const [team2, setTeam2] = useState<Team | null>(null);
  const [activeTab, setActiveTab] = useState('win_rate');

  // Load teams from URL params (?team1=...&team2=...)
  useEffect(() => {
    const t1Param = searchParams.get('team1');
    const t2Param = searchParams.get('team2');
    if (!t1Param && !t2Param) return;

    async function loadFromParam(param: string): Promise<Team | null> {
      const id = Number(param);
      if (!isNaN(id) && id > 0) {
        try {
          return await getTeam(id);
        } catch {
          return null;
        }
      }
      try {
        const res = await getTeams({ search: param, page: 1 });
        if (!res.results.length) return null;
        // Prefer exact name/short_name match over substring match
        const lower = param.toLowerCase();
        const exact = res.results.find(
          (t) =>
            t.name.toLowerCase() === lower ||
            t.short_name.toLowerCase() === lower
        );
        return exact ?? res.results[0];
      } catch {
        return null;
      }
    }

    async function load() {
      const [t1, t2] = await Promise.all([
        t1Param ? loadFromParam(t1Param) : Promise.resolve(null),
        t2Param ? loadFromParam(t2Param) : Promise.resolve(null),
      ]);
      if (t1) setTeam1(t1);
      if (t2) setTeam2(t2);
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const team1Id = team1?.id ?? null;
  const team2Id = team2?.id ?? null;

  const { data, loading, error } = useCompare(team1Id, team2Id);
  const {
    prediction,
    loading: predictionLoading,
  } = usePrediction(team1Id, team2Id);

  const currentTab = STAT_TABS.find((t) => t.key === activeTab) ?? STAT_TABS[0];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <GitCompare className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Comparar Times</h1>
      </div>

      {/* Team Selectors */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-start">
        <TeamSelector
          label="Blue Side"
          selectedTeam={team1}
          onSelect={setTeam1}
          onClear={() => setTeam1(null)}
          accentColor="blue"
        />

        <div className="flex items-center justify-center md:mt-8">
          <button
            onClick={() => {
              setTeam1(team2);
              setTeam2(team1);
            }}
            className="p-2 rounded-full bg-secondary border border-border hover:bg-primary/20 hover:border-primary/40 transition-colors text-muted-foreground hover:text-primary"
            title="Inverter sides"
          >
            <ArrowLeftRight size={18} />
          </button>
        </div>

        <TeamSelector
          label="Red Side"
          selectedTeam={team2}
          onSelect={setTeam2}
          onClear={() => setTeam2(null)}
          accentColor="red"
        />
      </div>

      {/* Placeholder */}
      {(!team1 || !team2) && (
        <div className="text-center py-12 text-muted-foreground">
          <GitCompare size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg">Selecione dois times para comparar</p>
          <p className="text-sm mt-1">
            Use os seletores acima para buscar e selecionar os times.
          </p>
        </div>
      )}

      {/* Prediction Card */}
      {team1 && team2 && (
        <PredictionCard prediction={prediction} loading={predictionLoading} />
      )}

      {team1 && team2 && loading && <Loading />}
      {team1 && team2 && error && <ErrorMessage message={error} />}

      {/* Comparison Results */}
      {data && data.overall && data.recent && data.faceoffs && team1 && team2 && (
        <>
          {/* Stat Tabs */}
          <div className="overflow-x-auto pb-1 -mx-1 px-1">
            <div className="flex gap-1.5 min-w-max">
              {STAT_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-full border transition-colors whitespace-nowrap',
                    activeTab === tab.key
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-muted-foreground border-border hover:text-foreground hover:border-foreground/30'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Three-Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Column 1: OVERALL */}
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-secondary/30">
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                  Overall
                </h3>
              </div>
              <div className="p-4 space-y-6">
                {/* ML Prediction for this stat */}
                {prediction?.predictions && TAB_PREDICTION_MAP[currentTab.key] && (
                  <PredictionBadge
                    value={prediction.predictions[TAB_PREDICTION_MAP[currentTab.key]] as number}
                    type={currentTab.type}
                  />
                )}

                {/* Current Split */}
                <div>
                  <p className="text-xs text-muted-foreground uppercase mb-3 font-medium">
                    {data.overall.split.label}
                  </p>
                  <RateBar
                    team1Value={data.overall.split.team1[currentTab.rateField] as number}
                    team2Value={data.overall.split.team2[currentTab.rateField] as number}
                    team1Name={data.team1_info.short_name || data.team1_info.name}
                    team2Name={data.team2_info.short_name || data.team2_info.name}
                    type={currentTab.type}
                  />
                  <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                    <span>{data.overall.split.team1.total} games</span>
                    <span>{data.overall.split.team2.total} games</span>
                  </div>
                  {FIRST_TABS.has(currentTab.key) && data.overall.split.team1.side_stats && data.overall.split.team2.side_stats && (
                    <SideBreakdownBars
                      team1Stats={data.overall.split.team1.side_stats}
                      team2Stats={data.overall.split.team2.side_stats}
                      field={currentTab.matchField as keyof CompareSideStats}
                      team1Name={data.team1_info.short_name || data.team1_info.name}
                      team2Name={data.team2_info.short_name || data.team2_info.name}
                    />
                  )}
                </div>

                {/* Separator */}
                <div className="border-t border-border" />

                {/* All Season */}
                <div>
                  <p className="text-xs text-muted-foreground uppercase mb-3 font-medium">
                    {data.overall.season.label} (All Season)
                  </p>
                  <RateBar
                    team1Value={data.overall.season.team1[currentTab.rateField] as number}
                    team2Value={data.overall.season.team2[currentTab.rateField] as number}
                    team1Name={data.team1_info.short_name || data.team1_info.name}
                    team2Name={data.team2_info.short_name || data.team2_info.name}
                    type={currentTab.type}
                  />
                  <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                    <span>{data.overall.season.team1.total} games</span>
                    <span>{data.overall.season.team2.total} games</span>
                  </div>
                  {FIRST_TABS.has(currentTab.key) && data.overall.season.team1.side_stats && data.overall.season.team2.side_stats && (
                    <SideBreakdownBars
                      team1Stats={data.overall.season.team1.side_stats}
                      team2Stats={data.overall.season.team2.side_stats}
                      field={currentTab.matchField as keyof CompareSideStats}
                      team1Name={data.team1_info.short_name || data.team1_info.name}
                      team2Name={data.team2_info.short_name || data.team2_info.name}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Column 2: RECENT FORM */}
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-secondary/30">
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                  Recent Form
                </h3>
              </div>
              <div className="p-4 space-y-5">
                {/* Last 5 */}
                <div>
                  <p className="text-xs text-muted-foreground uppercase mb-3 font-medium">
                    Last 5 Matches
                  </p>
                  <RateBar
                    team1Value={(data.recent.team1?.last5?.[currentTab.rateField] ?? 0) as number}
                    team2Value={(data.recent.team2?.last5?.[currentTab.rateField] ?? 0) as number}
                    team1Name={data.team1_info.short_name || data.team1_info.name}
                    team2Name={data.team2_info.short_name || data.team2_info.name}
                    type={currentTab.type}
                  />
                  {FIRST_TABS.has(currentTab.key) && data.recent.team1?.last5?.side_stats && data.recent.team2?.last5?.side_stats && (
                    <SideBreakdownBars
                      team1Stats={data.recent.team1.last5.side_stats}
                      team2Stats={data.recent.team2.last5.side_stats}
                      field={currentTab.matchField as keyof CompareSideStats}
                      team1Name={data.team1_info.short_name || data.team1_info.name}
                      team2Name={data.team2_info.short_name || data.team2_info.name}
                    />
                  )}
                </div>

                <div className="border-t border-border" />

                {/* Last 10 */}
                <div>
                  <p className="text-xs text-muted-foreground uppercase mb-3 font-medium">
                    Last 10 Matches
                  </p>
                  <RateBar
                    team1Value={(data.recent.team1?.last10?.[currentTab.rateField] ?? 0) as number}
                    team2Value={(data.recent.team2?.last10?.[currentTab.rateField] ?? 0) as number}
                    team1Name={data.team1_info.short_name || data.team1_info.name}
                    team2Name={data.team2_info.short_name || data.team2_info.name}
                    type={currentTab.type}
                  />
                  {FIRST_TABS.has(currentTab.key) && data.recent.team1?.last10?.side_stats && data.recent.team2?.last10?.side_stats && (
                    <SideBreakdownBars
                      team1Stats={data.recent.team1.last10.side_stats}
                      team2Stats={data.recent.team2.last10.side_stats}
                      field={currentTab.matchField as keyof CompareSideStats}
                      team1Name={data.team1_info.short_name || data.team1_info.name}
                      team2Name={data.team2_info.short_name || data.team2_info.name}
                    />
                  )}
                </div>

                <div className="border-t border-border" />

                {/* Per-match breakdown */}
                <div>
                  <p className="text-xs text-muted-foreground uppercase mb-3 font-medium">
                    Match-by-Match
                  </p>
                  <div className="space-y-0">
                    {/* Header */}
                    <div className="grid grid-cols-2 gap-3 pb-2 border-b border-border/50">
                      <span className="text-xs font-medium text-blue-400 text-center">
                        {data.team1_info.short_name || data.team1_info.name}
                      </span>
                      <span className="text-xs font-medium text-red-400 text-center">
                        {data.team2_info.short_name || data.team2_info.name}
                      </span>
                    </div>
                    {/* Rows - show each team's recent match with opponent */}
                    {(() => {
                      const t1m = data.recent.team1?.matches ?? [];
                      const t2m = data.recent.team2?.matches ?? [];
                      return Array.from(
                        { length: Math.max(t1m.length, t2m.length) },
                        (_, i) => {
                        const m1 = t1m[i];
                        const m2 = t2m[i];
                        const r1 = m1
                          ? getMatchValue(m1 as unknown as Record<string, unknown>, currentTab)
                          : null;
                        const r2 = m2
                          ? getMatchValue(m2 as unknown as Record<string, unknown>, currentTab)
                          : null;
                        return (
                          <div
                            key={i}
                            className="grid grid-cols-2 gap-3 py-1.5 border-b border-border/30 items-center"
                          >
                            {/* Team 1 match */}
                            <div className="flex items-center gap-1.5 justify-center">
                              {r1 ? (
                                <>
                                  {currentTab.type === 'rate' ? (
                                    <MatchIcon success={r1.success} />
                                  ) : (
                                    <span className={cn(
                                      'text-xs font-bold',
                                      m1!.is_winner ? 'text-green-400' : 'text-red-400'
                                    )}>
                                      {r1.display}
                                    </span>
                                  )}
                                  <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">
                                    vs {m1!.opponent}
                                  </span>
                                  <span className={cn(
                                    'text-[9px] font-bold px-1 rounded',
                                    m1!.side === 'Blue'
                                      ? 'bg-blue-500/20 text-blue-400'
                                      : 'bg-red-500/20 text-red-400'
                                  )}>
                                    {m1!.side === 'Blue' ? 'BLUE' : 'RED'}
                                  </span>
                                </>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  --
                                </span>
                              )}
                            </div>
                            {/* Team 2 match */}
                            <div className="flex items-center gap-1.5 justify-center">
                              {r2 ? (
                                <>
                                  {currentTab.type === 'rate' ? (
                                    <MatchIcon success={r2.success} />
                                  ) : (
                                    <span className={cn(
                                      'text-xs font-bold',
                                      m2!.is_winner ? 'text-green-400' : 'text-red-400'
                                    )}>
                                      {r2.display}
                                    </span>
                                  )}
                                  <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">
                                    vs {m2!.opponent}
                                  </span>
                                  <span className={cn(
                                    'text-[9px] font-bold px-1 rounded',
                                    m2!.side === 'Blue'
                                      ? 'bg-blue-500/20 text-blue-400'
                                      : 'bg-red-500/20 text-red-400'
                                  )}>
                                    {m2!.side === 'Blue' ? 'BLUE' : 'RED'}
                                  </span>
                                </>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  --
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      }
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>

            {/* Column 3: PAST FACEOFFS */}
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-secondary/30">
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                  Past Faceoffs
                </h3>
              </div>
              <div className="p-4 space-y-5">
                {data.faceoffs.total === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-sm">Nenhum confronto direto encontrado.</p>
                  </div>
                ) : (
                  <>
                    {/* H2H Overall Rate */}
                    <div>
                      <p className="text-xs text-muted-foreground uppercase mb-3 font-medium">
                        Head-to-Head ({data.faceoffs.total}{' '}
                        {data.faceoffs.total === 1 ? 'game' : 'games'})
                      </p>
                      <RateBar
                        team1Value={(data.faceoffs.team1?.[currentTab.rateField] ?? 0) as number}
                        team2Value={(data.faceoffs.team2?.[currentTab.rateField] ?? 0) as number}
                        team1Name={data.team1_info.short_name || data.team1_info.name}
                        team2Name={data.team2_info.short_name || data.team2_info.name}
                        type={currentTab.type}
                      />
                    </div>

                    <div className="border-t border-border" />

                    {/* Per-faceoff match list */}
                    <div>
                      <p className="text-xs text-muted-foreground uppercase mb-3 font-medium">
                        Match History
                      </p>
                      <div className="space-y-0">
                        {/* Header */}
                        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 pb-2 border-b border-border/50">
                          <span className="text-xs font-medium text-blue-400 text-center">
                            {data.team1_info.short_name || data.team1_info.name}
                          </span>
                          <span className="text-xs text-muted-foreground w-16 text-center">
                            Date
                          </span>
                          <span className="text-xs font-medium text-red-400 text-center">
                            {data.team2_info.short_name || data.team2_info.name}
                          </span>
                        </div>
                        {/* Rows */}
                        {(data.faceoffs.matches ?? []).map((fm, i) => {
                          const r1 = getMatchValue(
                            fm.team1 as unknown as Record<string, unknown>,
                            currentTab
                          );
                          const r2 = getMatchValue(
                            fm.team2 as unknown as Record<string, unknown>,
                            currentTab
                          );
                          const t1Won = fm.team1.is_winner;
                          const t2Won = fm.team2.is_winner;
                          return (
                            <div
                              key={fm.match_id}
                              onClick={() => navigate(`/matches/${fm.match_id}`)}
                              className="grid grid-cols-[1fr_auto_1fr] gap-2 py-2 border-b border-border/30 items-center cursor-pointer hover:bg-secondary/40 transition-colors rounded"
                            >
                              {/* Team 1 */}
                              <div className="flex flex-col items-center gap-1">
                                {currentTab.type === 'rate' ? (
                                  <MatchIcon success={r1.success} />
                                ) : (
                                  <span className="text-xs font-bold text-foreground">
                                    {r1.display}
                                  </span>
                                )}
                                <span className={cn(
                                  'text-[8px] font-bold px-1.5 py-px rounded',
                                  t1Won
                                    ? 'bg-green-500/20 text-green-400'
                                    : 'bg-red-500/15 text-red-400/60'
                                )}>
                                  {t1Won ? 'WIN' : 'LOSS'}
                                </span>
                              </div>
                              {/* Date */}
                              <span className="text-[10px] text-muted-foreground w-16 text-center">
                                {formatDate(fm.date)}
                              </span>
                              {/* Team 2 */}
                              <div className="flex flex-col items-center gap-1">
                                {currentTab.type === 'rate' ? (
                                  <MatchIcon success={r2.success} />
                                ) : (
                                  <span className="text-xs font-bold text-foreground">
                                    {r2.display}
                                  </span>
                                )}
                                <span className={cn(
                                  'text-[8px] font-bold px-1.5 py-px rounded',
                                  t2Won
                                    ? 'bg-green-500/20 text-green-400'
                                    : 'bg-red-500/15 text-red-400/60'
                                )}>
                                  {t2Won ? 'WIN' : 'LOSS'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
