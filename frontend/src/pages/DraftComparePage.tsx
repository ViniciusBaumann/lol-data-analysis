import { useState, useEffect, useRef } from 'react';
import { Crosshair, Search, ChevronDown, X, RotateCcw, Loader2, Skull, TowerControl, Flame, Crown, Users } from 'lucide-react';
import { useDraft, DraftSlot } from '@/hooks/useDraft';
import { ChampionInfo, Team } from '@/types';
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

// ---------------------------------------------------------------------------
// Champion Selector Sub-Component
// ---------------------------------------------------------------------------

interface ChampionSelectorProps {
  slot: DraftSlot;
  position: string;
  selectedChampion: string | null;
  champions: ChampionInfo[];
  disabledChampions: Set<string>;
  onSelect: (slot: DraftSlot, champion: string) => void;
  onClear: (slot: DraftSlot) => void;
  accentColor: 'blue' | 'red';
}

function ChampionSelector({
  slot,
  position,
  selectedChampion,
  champions,
  disabledChampions,
  onSelect,
  onClear,
  accentColor,
}: ChampionSelectorProps) {
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

  const borderColor = accentColor === 'blue' ? 'border-blue-500/50' : 'border-red-500/50';
  const accentTextColor = accentColor === 'blue' ? 'text-blue-400' : 'text-red-400';
  const accentBg = accentColor === 'blue' ? 'bg-blue-500/10' : 'bg-red-500/10';

  // Filter and sort champions
  const filtered = champions.filter((c) => {
    if (search.trim() && !c.champion.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return true;
  });

  // Sort: played in this position first, then alphabetical
  const sorted = [...filtered].sort((a, b) => {
    const aInPos = a.positions.some((p) => p.position.toLowerCase() === position);
    const bInPos = b.positions.some((p) => p.position.toLowerCase() === position);
    if (aInPos && !bInPos) return -1;
    if (!aInPos && bInPos) return 1;
    return a.champion.localeCompare(b.champion);
  });

  if (selectedChampion) {
    const info = champions.find((c) => c.champion === selectedChampion);
    return (
      <div className={cn('border-2 rounded-lg p-3', borderColor, accentBg)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', accentBg, accentTextColor)}>
              {POSITION_LABELS[position]}
            </span>
            <span className="text-sm font-bold text-foreground">{selectedChampion}</span>
          </div>
          <button
            onClick={() => {
              onClear(slot);
              setSearch('');
            }}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={14} />
          </button>
        </div>
        {info && (
          <div className="mt-1 text-xs text-muted-foreground">
            {info.games} games | {info.win_rate}% WR | KDA {info.avg_kda}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className={cn('border-2 border-dashed rounded-lg p-3', borderColor)}>
        <div className="flex items-center gap-2 mb-2">
          <span className={cn('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', accentBg, accentTextColor)}>
            {POSITION_LABELS[position]}
          </span>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search champion..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            className="w-full bg-secondary border border-border rounded-md pl-8 pr-8 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl max-h-52 overflow-y-auto">
          {sorted.length === 0 && (
            <div className="p-3 text-xs text-muted-foreground text-center">
              No champions found.
            </div>
          )}
          {sorted.map((champ) => {
            const isDisabled = disabledChampions.has(champ.champion);
            const inPosition = champ.positions.some(
              (p) => p.position.toLowerCase() === position
            );
            return (
              <button
                key={champ.champion}
                disabled={isDisabled}
                onClick={() => {
                  onSelect(slot, champ.champion);
                  setSearch('');
                  setOpen(false);
                }}
                className={cn(
                  'w-full text-left px-3 py-2 transition-colors border-b border-border/30 last:border-0',
                  isDisabled
                    ? 'opacity-30 cursor-not-allowed'
                    : 'hover:bg-secondary/50 cursor-pointer'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{champ.champion}</span>
                  {inPosition && (
                    <span className={cn('text-[9px] font-bold px-1 rounded', accentBg, accentTextColor)}>
                      {POSITION_LABELS[position]}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {champ.games} games | {champ.win_rate}% WR | KDA {champ.avg_kda}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Draft Compare Page
// ---------------------------------------------------------------------------
// Team Picker Sub-Component
// ---------------------------------------------------------------------------

interface TeamPickerProps {
  label: string;
  selectedTeamId: number | null;
  teams: Team[];
  onSelect: (id: number) => void;
  onClear: () => void;
  accentColor: 'blue' | 'red';
}

function TeamPicker({ label, selectedTeamId, teams, onSelect, onClear, accentColor }: TeamPickerProps) {
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

  const accentTextColor = accentColor === 'blue' ? 'text-blue-400' : 'text-red-400';
  const accentBg = accentColor === 'blue' ? 'bg-blue-500/10' : 'bg-red-500/10';
  const borderColor = accentColor === 'blue' ? 'border-blue-500/50' : 'border-red-500/50';

  const selectedTeam = teams.find((t) => t.id === selectedTeamId);

  const filtered = teams.filter((t) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return t.name.toLowerCase().includes(q) || t.short_name.toLowerCase().includes(q);
  });

  if (selectedTeam) {
    return (
      <div className={cn('border-2 rounded-lg px-3 py-2', borderColor, accentBg)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={14} className={accentTextColor} />
            <span className="text-sm font-bold text-foreground">{selectedTeam.short_name || selectedTeam.name}</span>
          </div>
          <button onClick={onClear} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className={cn('border border-dashed rounded-lg px-3 py-2', borderColor)}>
        <div className="relative">
          <Users size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder={`${label} (optional)...`}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            className="w-full bg-secondary border border-border rounded-md pl-8 pr-8 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl max-h-44 overflow-y-auto">
          {filtered.map((team) => (
            <button
              key={team.id}
              onClick={() => { onSelect(team.id); setSearch(''); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-secondary/50 cursor-pointer border-b border-border/30 last:border-0"
            >
              <span className="text-sm font-medium text-foreground">{team.short_name || team.name}</span>
              <span className="text-xs text-muted-foreground ml-2">{team.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Draft Compare Page
// ---------------------------------------------------------------------------

export default function DraftComparePage() {
  const {
    draft,
    setSlot,
    clearSlot,
    clearDraft,
    isComplete,
    champions,
    championsLoading,
    selectedChampions,
    prediction,
    predictionLoading,
    error,
    teams,
    teamsLoading,
    blueTeamId,
    redTeamId,
    setBlueTeamId,
    setRedTeamId,
  } = useDraft();

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Crosshair className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Draft Compare</h1>
        </div>
        <button
          onClick={clearDraft}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-secondary border border-border hover:bg-destructive/20 hover:border-destructive/40 hover:text-red-400 transition-colors text-muted-foreground"
        >
          <RotateCcw size={14} />
          Reset
        </button>
      </div>

      {/* Draft Selectors */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-start">
        {/* Blue Side */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-blue-400 font-medium">
            Blue Side
          </h2>
          <TeamPicker
            label="Select team"
            selectedTeamId={blueTeamId}
            teams={teams}
            onSelect={setBlueTeamId}
            onClear={() => setBlueTeamId(null)}
            accentColor="blue"
          />
          {POSITIONS.map((pos) => {
            const slot = `blue_${pos}` as DraftSlot;
            return (
              <ChampionSelector
                key={slot}
                slot={slot}
                position={pos}
                selectedChampion={draft[slot]}
                champions={champions}
                disabledChampions={selectedChampions}
                onSelect={setSlot}
                onClear={clearSlot}
                accentColor="blue"
              />
            );
          })}
        </div>

        {/* VS divider */}
        <div className="hidden md:flex flex-col items-center justify-center gap-4 pt-8">
          <span className="text-lg font-bold text-muted-foreground">VS</span>
        </div>

        {/* Red Side */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-red-400 font-medium">
            Red Side
          </h2>
          <TeamPicker
            label="Select team"
            selectedTeamId={redTeamId}
            teams={teams}
            onSelect={setRedTeamId}
            onClear={() => setRedTeamId(null)}
            accentColor="red"
          />
          {POSITIONS.map((pos) => {
            const slot = `red_${pos}` as DraftSlot;
            return (
              <ChampionSelector
                key={slot}
                slot={slot}
                position={pos}
                selectedChampion={draft[slot]}
                champions={champions}
                disabledChampions={selectedChampions}
                onSelect={setSlot}
                onClear={clearSlot}
                accentColor="red"
              />
            );
          })}
        </div>
      </div>

      {/* Placeholder when draft not complete */}
      {!isComplete && !predictionLoading && (
        <div className="text-center py-8 text-muted-foreground">
          <Crosshair size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg">Select all 10 champions to see predictions</p>
          <p className="text-sm mt-1">
            Pick one champion per role for each side.
          </p>
        </div>
      )}

      {/* Loading state */}
      {predictionLoading && (
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">
              Computing draft prediction...
            </span>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !predictionLoading && (
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-2 mb-3">
            <Crosshair size={18} className="text-primary" />
            <h3 className="text-sm font-semibold text-foreground font-medium">
              Draft Prediction
            </h3>
          </div>
          <div className="text-center py-4 text-muted-foreground">
            <p className="text-sm">{error}</p>
            {prediction && !prediction.models_loaded && prediction.features_available && (
              <p className="text-xs mt-2 font-mono bg-secondary/50 inline-block px-3 py-1 rounded">
                Run: python manage.py train_draft_model
              </p>
            )}
          </div>
        </div>
      )}

      {/* Prediction Results */}
      {prediction?.predictions && !predictionLoading && (() => {
        const preds = prediction.predictions;
        const blueBetter = preds.blue_win_prob > preds.red_win_prob;
        return (
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center gap-2 mb-5">
              <Crosshair size={18} className="text-primary" />
              <h3 className="text-sm font-semibold text-foreground font-medium">
                Draft Prediction
              </h3>
            </div>

            {/* Win Probability Bar */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <span className={cn('text-sm font-bold', blueBetter ? 'text-blue-400' : 'text-muted-foreground')}>
                  Blue Side
                </span>
                <span className={cn('text-sm font-bold', !blueBetter ? 'text-red-400' : 'text-muted-foreground')}>
                  Red Side
                </span>
              </div>
              <div className="relative h-4 bg-secondary rounded overflow-hidden flex">
                <div
                  className="h-full bg-blue-500 transition-all duration-500"
                  style={{ width: `${preds.blue_win_prob}%` }}
                />
                <div
                  className="h-full bg-red-500 transition-all duration-500"
                  style={{ width: `${preds.red_win_prob}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className={cn('text-xs font-bold', blueBetter ? 'text-blue-400' : 'text-muted-foreground')}>
                  {preds.blue_win_prob}%
                </span>
                <span className={cn('text-xs font-bold', !blueBetter ? 'text-red-400' : 'text-muted-foreground')}>
                  {preds.red_win_prob}%
                </span>
              </div>
            </div>

            {/* Estimated Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-secondary/40 rounded-lg px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Skull size={14} className="text-red-400" />
                  <p className="text-xs text-muted-foreground uppercase">Est. Kills</p>
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {preds.total_kills}
                </p>
              </div>
              <div className="bg-secondary/40 rounded-lg px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <TowerControl size={14} className="text-blue-400" />
                  <p className="text-xs text-muted-foreground uppercase">Towers</p>
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {preds.total_towers}
                </p>
              </div>
              <div className="bg-secondary/40 rounded-lg px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Flame size={14} className="text-orange-400" />
                  <p className="text-xs text-muted-foreground uppercase">Dragons</p>
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {preds.total_dragons}
                </p>
              </div>
              <div className="bg-secondary/40 rounded-lg px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Crown size={14} className="text-purple-400" />
                  <p className="text-xs text-muted-foreground uppercase">Barons</p>
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {preds.total_barons}
                </p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground mt-4 text-center">
              {prediction.teams_provided
                ? 'Predictions based on champion stats + team history, ELO, and head-to-head data.'
                : 'Predictions based on champion stats only. Select teams for higher accuracy.'}
            </p>
          </div>
        );
      })()}
    </div>
  );
}
