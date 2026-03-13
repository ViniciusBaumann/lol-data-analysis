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
          <XAxis type="number" tick={{ fill: '#888', fontSize: 12 }} />
          <YAxis type="category" dataKey="league_name" tick={{ fill: '#888', fontSize: 11 }} width={75} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px', color: '#f5f5f5' }}
          />
          <Bar dataKey="match_count" fill="#00d4aa" radius={[0, 4, 4, 0]} name="Partidas" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
