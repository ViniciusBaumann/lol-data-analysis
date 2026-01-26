import { useLeagues } from '@/hooks/useLeagues';

interface FilterBarProps {
  filters: {
    league?: number;
    year?: number;
    split?: string;
  };
  onChange: (filters: { league?: number; year?: number; split?: string }) => void;
  showSplit?: boolean;
}

export function FilterBar({ filters, onChange, showSplit = true }: FilterBarProps) {
  const { data: leagues } = useLeagues();
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

  return (
    <div className="flex flex-wrap gap-3">
      <select
        value={filters.league || ''}
        onChange={e => onChange({ ...filters, league: e.target.value ? Number(e.target.value) : undefined })}
        className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <option value="">Todas as ligas</option>
        {leagues.map(l => (
          <option key={l.id} value={l.id}>{l.name}</option>
        ))}
      </select>

      <select
        value={filters.year || ''}
        onChange={e => onChange({ ...filters, year: e.target.value ? Number(e.target.value) : undefined })}
        className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <option value="">Todos os anos</option>
        {years.map(y => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>

      {showSplit && (
        <select
          value={filters.split || ''}
          onChange={e => onChange({ ...filters, split: e.target.value || undefined })}
          className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">Todos os splits</option>
          <option value="Spring">Spring</option>
          <option value="Summer">Summer</option>
          <option value="Winter">Winter</option>
        </select>
      )}
    </div>
  );
}
