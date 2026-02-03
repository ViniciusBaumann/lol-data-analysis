import { cn } from '@/lib/utils';

interface GoldDiffChartProps {
  golddiffat10: number;
  golddiffat15: number;
  xpdiffat10: number;
  xpdiffat15: number;
}

export function GoldDiffChart({ golddiffat10, golddiffat15, xpdiffat10, xpdiffat15 }: GoldDiffChartProps) {
  const formatDiff = (val: number) => {
    // Show N/A when value is exactly 0 (indicates no data)
    if (val === 0) return 'N/A';
    const sign = val >= 0 ? '+' : '';
    return `${sign}${val.toFixed(0)}`;
  };
  const diffColor = (val: number) => val === 0 ? 'text-muted-foreground' : val >= 0 ? 'text-green-400' : 'text-red-400';

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <h3 className="text-sm font-medium text-foreground mb-4">Early Game Diferentials (Media)</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Gold Diff</p>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">@10 min</span>
            <span className={cn("text-lg font-bold", diffColor(golddiffat10))}>{formatDiff(golddiffat10)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">@15 min</span>
            <span className={cn("text-lg font-bold", diffColor(golddiffat15))}>{formatDiff(golddiffat15)}</span>
          </div>
        </div>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">XP Diff</p>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">@10 min</span>
            <span className={cn("text-lg font-bold", diffColor(xpdiffat10))}>{formatDiff(xpdiffat10)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">@15 min</span>
            <span className={cn("text-lg font-bold", diffColor(xpdiffat15))}>{formatDiff(xpdiffat15)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
