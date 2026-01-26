import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
}

export function StatCard({ title, value, subtitle, icon: Icon, trend, className }: StatCardProps) {
  return (
    <div className={cn("bg-card border border-border rounded-lg p-5", className)}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{title}</p>
        {Icon && <Icon size={18} className="text-muted-foreground" />}
      </div>
      <p className={cn(
        "text-2xl font-bold mt-2",
        trend === 'up' && "text-green-400",
        trend === 'down' && "text-red-400"
      )}>
        {value}
      </p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  );
}
