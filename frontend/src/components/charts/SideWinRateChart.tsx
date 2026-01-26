import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface SideWinRateChartProps {
  blueWins: number;
  redWins: number;
}

export function SideWinRateChart({ blueWins, redWins }: SideWinRateChartProps) {
  const data = [
    { name: 'Blue Side', value: blueWins },
    { name: 'Red Side', value: redWins },
  ];
  const COLORS = ['#3B82F6', '#EF4444'];
  const total = blueWins + redWins;

  if (total === 0) return <p className="text-muted-foreground text-sm text-center py-8">Sem dados</p>;

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <h3 className="text-sm font-medium text-foreground mb-4">Win Rate por Lado</h3>
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={4} dataKey="value">
            {data.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
          </Pie>
          <Tooltip
            contentStyle={{ backgroundColor: 'hsl(222 47% 8%)', border: '1px solid hsl(217 33% 17%)', borderRadius: '8px', color: '#fff' }}
            formatter={(value: number, name: string) => [`${value} (${((value / total) * 100).toFixed(1)}%)`, name]}
          />
          <Legend wrapperStyle={{ color: 'hsl(215 20% 65%)' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
