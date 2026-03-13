import { cn } from '@/lib/utils';

interface WinRateBarProps {
  winRate: number;
  label?: string;
  showPercentage?: boolean;
  className?: string;
}

export function WinRateBar({ winRate, label, showPercentage = true, className }: WinRateBarProps) {
  const color = winRate >= 60 ? 'bg-green-500' : winRate >= 50 ? 'bg-blue-500' : winRate >= 40 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className={cn("space-y-1", className)}>
      {(label || showPercentage) && (
        <div className="flex justify-between text-sm">
          {label && <span className="text-muted-foreground">{label}</span>}
          {showPercentage && <span className="font-medium">{winRate.toFixed(1)}%</span>}
        </div>
      )}
      <div className="h-2 bg-secondary rounded overflow-hidden">
        <div className={cn("h-full rounded transition-all", color)} style={{ width: `${Math.min(winRate, 100)}%` }} />
      </div>
    </div>
  );
}
