import { useState, useEffect, useRef, useMemo } from 'react';
import { Shield, Search, ChevronDown, Loader2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useChampionMatchups, MatchupMode } from '@/hooks/useChampionMatchups';
import { ChampionInfo, MatchupResult, DuoResult } from '@/types';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POSITIONS = ['top', 'jng', 'mid', 'bot', 'sup'] as const;

const POSITION_LABELS: Record<string, string> = {
  top: 'TOP',
  jng: 'JNG',
  mid: 'MID',
  bot: 'BOT',
  sup: 'SUP',
};

const MODES: { value: MatchupMode; label: string }[] = [
  { value: 'direct', label: 'Direct' },
  { value: 'indirect', label: 'Indirect' },
  { value: 'synergy', label: 'Synergy' },
  { value: 'duos', label: 'Best Duos' },
];

// ---------------------------------------------------------------------------
// Champion Search Selector
// ---------------------------------------------------------------------------

interface ChampionPickerProps {
  champions: ChampionInfo[];
  selected: string;
  onSelect: (name: string) => void;
  disabled?: boolean;
}

function ChampionPicker({ champions, selected, onSelect, disabled }: ChampionPickerProps) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = champions.filter((c) => {
    if (!search.trim()) return true;
    return c.champion.toLowerCase().includes(search.toLowerCase());
  });

  if (selected) {
    const info = champions.find((c) => c.champion === selected);
    return (
      <div className="border-2 border-primary/50 bg-primary/5 rounded-lg px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-foreground">{selected}</span>
          <button
            onClick={() => { onSelect(''); setSearch(''); }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
        </div>
        {info && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {info.games} games | {info.win_rate}% WR
          </p>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className={cn('border border-border rounded-lg px-3 py-2', disabled && 'opacity-50 pointer-events-none')}>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search champion..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            className="w-full bg-secondary border border-border rounded-md pl-8 pr-8 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      {open && !disabled && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl max-h-52 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="p-3 text-xs text-muted-foreground text-center">No champions found.</div>
          )}
          {filtered.map((champ) => (
            <button
              key={champ.champion}
              onClick={() => { onSelect(champ.champion); setSearch(''); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-secondary/50 cursor-pointer border-b border-border/30 last:border-0"
            >
              <span className="text-sm font-medium text-foreground">{champ.champion}</span>
              <p className="text-[10px] text-muted-foreground">
                {champ.games} games | {champ.win_rate}% WR | KDA {champ.avg_kda}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Win Rate Bar
// ---------------------------------------------------------------------------

function WinRateBar({ winRate }: { winRate: number }) {
  const color = winRate >= 55 ? 'bg-green-500' : winRate >= 50 ? 'bg-green-400/70' : winRate >= 45 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-secondary rounded overflow-hidden">
        <div className={cn('h-full rounded transition-all', color)} style={{ width: `${winRate}%` }} />
      </div>
      <span className={cn(
        'text-xs font-bold min-w-[40px] text-right',
        winRate >= 50 ? 'text-green-400' : 'text-red-400'
      )}>
        {winRate}%
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sort helpers
// ---------------------------------------------------------------------------

type SortKey = 'champion' | 'position' | 'games' | 'wins' | 'losses' | 'win_rate'
  | 'champion1' | 'position1' | 'champion2' | 'position2';
type SortDir = 'asc' | 'desc';

function useSortable(defaultKey: SortKey = 'win_rate', defaultDir: SortDir = 'desc') {
  const [sortKey, setSortKey] = useState<SortKey>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  const toggle = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'champion' || key === 'champion1' || key === 'champion2' || key === 'position' || key === 'position1' || key === 'position2' ? 'asc' : 'desc');
    }
  };

  return { sortKey, sortDir, toggle };
}

function sortResults<T extends Record<string, unknown>>(items: T[], key: string, dir: SortDir): T[] {
  return [...items].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    const aNum = Number(aVal) || 0;
    const bNum = Number(bVal) || 0;
    return dir === 'asc' ? aNum - bNum : bNum - aNum;
  });
}

// ---------------------------------------------------------------------------
// Sortable Header
// ---------------------------------------------------------------------------

interface SortHeaderProps {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  currentDir: SortDir;
  onToggle: (key: SortKey) => void;
  className?: string;
}

function SortHeader({ label, sortKey, currentKey, currentDir, onToggle, className }: SortHeaderProps) {
  const isActive = currentKey === sortKey;
  return (
    <th
      className={cn('px-4 py-3 text-left text-xs font-semibold text-muted-foreground font-medium cursor-pointer select-none hover:text-foreground transition-colors', className)}
      onClick={() => onToggle(sortKey)}
    >
      <div className="flex items-center gap-1">
        {label}
        {isActive ? (
          currentDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
        ) : (
          <ArrowUpDown size={12} className="opacity-30" />
        )}
      </div>
    </th>
  );
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function ChampionMatchupsPage() {
  const {
    champion, setChampion,
    position, setPosition,
    mode, setMode,
    targetPosition, setTargetPosition,
    minGames, setMinGames,
    champions, championsLoading,
    data, loading, error,
  } = useChampionMatchups();

  const isDuos = mode === 'duos';
  const showTargetPosition = mode === 'indirect' || mode === 'synergy';

  const { sortKey, sortDir, toggle } = useSortable('win_rate', 'desc');

  const sortedResults = useMemo(() => {
    if (!data?.results) return [];
    return sortResults(data.results as Record<string, unknown>[], sortKey, sortDir);
  }, [data?.results, sortKey, sortDir]);

  const isDuoResults = isDuos && data?.mode === 'duos';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Shield className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Champion Matchups</h1>
      </div>

      {/* Controls */}
      <div className="bg-card border border-border rounded-lg p-5 space-y-4">
        {/* Champion + Position row */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-start">
          <div className={cn(isDuos && 'opacity-50 pointer-events-none')}>
            <label className="text-xs font-semibold text-muted-foreground font-medium mb-1.5 block">
              Champion
            </label>
            <ChampionPicker
              champions={champions}
              selected={champion}
              onSelect={setChampion}
              disabled={isDuos}
            />
          </div>

          <div className={cn(isDuos && 'opacity-50 pointer-events-none')}>
            <label className="text-xs font-semibold text-muted-foreground font-medium mb-1.5 block">
              Position
            </label>
            <div className="flex gap-1">
              {POSITIONS.map((pos) => (
                <button
                  key={pos}
                  onClick={() => setPosition(pos)}
                  disabled={isDuos}
                  className={cn(
                    'px-3 py-2 text-xs font-bold uppercase rounded-md transition-colors',
                    position === pos
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                  )}
                >
                  {POSITION_LABELS[pos]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Mode Tabs */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground font-medium mb-1.5 block">
            Mode
          </label>
          <div className="flex gap-1 flex-wrap">
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => setMode(m.value)}
                className={cn(
                  'px-4 py-2 text-sm font-medium rounded-md transition-colors',
                  mode === m.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Target Position + Min Games row */}
        <div className="flex flex-wrap gap-4 items-end">
          {showTargetPosition && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground font-medium mb-1.5 block">
                Target Position
              </label>
              <div className="flex gap-1">
                <button
                  onClick={() => setTargetPosition('')}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                    targetPosition === ''
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground hover:text-foreground'
                  )}
                >
                  All
                </button>
                {POSITIONS.filter((p) => p !== position).map((pos) => (
                  <button
                    key={pos}
                    onClick={() => setTargetPosition(pos)}
                    className={cn(
                      'px-3 py-1.5 text-xs font-bold uppercase rounded-md transition-colors',
                      targetPosition === pos
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {POSITION_LABELS[pos]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-muted-foreground font-medium mb-1.5 block">
              Min Games
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={minGames}
              onChange={(e) => setMinGames(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-20 bg-secondary border border-border rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">Loading matchup data...</span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="bg-card border border-border rounded-lg p-6 text-center">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && !data && !isDuos && (
        <div className="text-center py-8 text-muted-foreground">
          <Shield size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg">Select a champion and position to view matchups</p>
          <p className="text-sm mt-1">Choose a mode to explore direct, indirect, or synergy data.</p>
        </div>
      )}

      {/* Results */}
      {!loading && !error && data && data.results.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  {isDuoResults ? (
                    <>
                      <SortHeader label="Champion 1" sortKey="champion1" currentKey={sortKey} currentDir={sortDir} onToggle={toggle} />
                      <SortHeader label="Pos" sortKey="position1" currentKey={sortKey} currentDir={sortDir} onToggle={toggle} />
                      <SortHeader label="Champion 2" sortKey="champion2" currentKey={sortKey} currentDir={sortDir} onToggle={toggle} />
                      <SortHeader label="Pos" sortKey="position2" currentKey={sortKey} currentDir={sortDir} onToggle={toggle} />
                    </>
                  ) : (
                    <>
                      <SortHeader label="Champion" sortKey="champion" currentKey={sortKey} currentDir={sortDir} onToggle={toggle} />
                      <SortHeader label="Position" sortKey="position" currentKey={sortKey} currentDir={sortDir} onToggle={toggle} />
                    </>
                  )}
                  <SortHeader label="Games" sortKey="games" currentKey={sortKey} currentDir={sortDir} onToggle={toggle} />
                  <SortHeader label="Wins" sortKey="wins" currentKey={sortKey} currentDir={sortDir} onToggle={toggle} />
                  <SortHeader label="Losses" sortKey="losses" currentKey={sortKey} currentDir={sortDir} onToggle={toggle} />
                  <SortHeader label="Win Rate" sortKey="win_rate" currentKey={sortKey} currentDir={sortDir} onToggle={toggle} className="min-w-[180px]" />
                </tr>
              </thead>
              <tbody>
                {sortedResults.map((row, idx) => {
                  const r = row as Record<string, unknown>;
                  return (
                    <tr key={idx} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                      {isDuoResults ? (
                        <>
                          <td className="px-4 py-3 text-sm font-medium text-foreground">{String(r.champion1)}</td>
                          <td className="px-4 py-3">
                            <span className="text-[10px] font-bold uppercase bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">
                              {POSITION_LABELS[String(r.position1).toLowerCase()] || String(r.position1)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-foreground">{String(r.champion2)}</td>
                          <td className="px-4 py-3">
                            <span className="text-[10px] font-bold uppercase bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">
                              {POSITION_LABELS[String(r.position2).toLowerCase()] || String(r.position2)}
                            </span>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-sm font-medium text-foreground">{String(r.champion)}</td>
                          <td className="px-4 py-3">
                            <span className="text-[10px] font-bold uppercase bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">
                              {POSITION_LABELS[String(r.position).toLowerCase()] || String(r.position)}
                            </span>
                          </td>
                        </>
                      )}
                      <td className="px-4 py-3 text-sm text-foreground">{Number(r.games)}</td>
                      <td className="px-4 py-3 text-sm text-green-400">{Number(r.wins)}</td>
                      <td className="px-4 py-3 text-sm text-red-400">{Number(r.losses)}</td>
                      <td className="px-4 py-3">
                        <WinRateBar winRate={Number(r.win_rate)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* No results */}
      {!loading && !error && data && data.results.length === 0 && (
        <div className="bg-card border border-border rounded-lg p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No results found. Try lowering the minimum games threshold or selecting a different champion/position.
          </p>
        </div>
      )}
    </div>
  );
}
