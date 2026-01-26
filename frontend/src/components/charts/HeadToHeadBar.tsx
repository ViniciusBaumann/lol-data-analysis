import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface HeadToHeadBarProps {
  team1Name: string;
  team2Name: string;
  team1Stats: { avg_kills: number; avg_deaths: number; avg_assists: number; avg_dragons: number; avg_barons: number; avg_towers: number; avg_gold: number };
  team2Stats: { avg_kills: number; avg_deaths: number; avg_assists: number; avg_dragons: number; avg_barons: number; avg_towers: number; avg_gold: number };
}

export function HeadToHeadBar({ team1Name, team2Name, team1Stats, team2Stats }: HeadToHeadBarProps) {
  const data = [
    { stat: 'Kills', [team1Name]: team1Stats.avg_kills, [team2Name]: team2Stats.avg_kills },
    { stat: 'Deaths', [team1Name]: team1Stats.avg_deaths, [team2Name]: team2Stats.avg_deaths },
    { stat: 'Assists', [team1Name]: team1Stats.avg_assists, [team2Name]: team2Stats.avg_assists },
    { stat: 'Dragoes', [team1Name]: team1Stats.avg_dragons, [team2Name]: team2Stats.avg_dragons },
    { stat: 'Baroes', [team1Name]: team1Stats.avg_barons, [team2Name]: team2Stats.avg_barons },
    { stat: 'Torres', [team1Name]: team1Stats.avg_towers, [team2Name]: team2Stats.avg_towers },
  ];

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <h3 className="text-sm font-medium text-foreground mb-4">Comparacao de Stats</h3>
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={data}>
          <XAxis dataKey="stat" tick={{ fill: 'hsl(215 20% 65%)', fontSize: 12 }} />
          <YAxis tick={{ fill: 'hsl(215 20% 65%)', fontSize: 12 }} />
          <Tooltip contentStyle={{ backgroundColor: 'hsl(222 47% 8%)', border: '1px solid hsl(217 33% 17%)', borderRadius: '8px', color: '#fff' }} />
          <Legend wrapperStyle={{ color: 'hsl(215 20% 65%)' }} />
          <Bar dataKey={team1Name} fill="#3B82F6" radius={[4, 4, 0, 0]} />
          <Bar dataKey={team2Name} fill="#EF4444" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
