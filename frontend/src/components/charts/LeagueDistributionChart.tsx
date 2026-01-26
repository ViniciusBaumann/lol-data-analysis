import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface LeagueDistributionChartProps {
  data: { league_name: string; match_count: number }[];
}

export function LeagueDistributionChart({ data }: LeagueDistributionChartProps) {
  const chartData = data.slice(0, 15);

  if (chartData.length === 0) return <p className="text-muted-foreground text-sm text-center py-8">Sem dados</p>;

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <h3 className="text-sm font-medium text-foreground mb-4">Partidas por Liga</h3>
      <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 30)}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 80 }}>
          <XAxis type="number" tick={{ fill: 'hsl(215 20% 65%)', fontSize: 12 }} />
          <YAxis type="category" dataKey="league_name" tick={{ fill: 'hsl(215 20% 65%)', fontSize: 11 }} width={75} />
          <Tooltip
            contentStyle={{ backgroundColor: 'hsl(222 47% 8%)', border: '1px solid hsl(217 33% 17%)', borderRadius: '8px', color: '#fff' }}
          />
          <Bar dataKey="match_count" fill="#3B82F6" radius={[0, 4, 4, 0]} name="Partidas" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
