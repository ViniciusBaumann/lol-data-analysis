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
          <XAxis dataKey="stat" tick={{ fill: '#888', fontSize: 12 }} />
          <YAxis tick={{ fill: '#888', fontSize: 12 }} />
          <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px', color: '#f5f5f5' }} />
          <Legend wrapperStyle={{ color: '#888' }} />
          <Bar dataKey={team1Name} fill="#00d4aa" radius={[4, 4, 0, 0]} />
          <Bar dataKey={team2Name} fill="#EF4444" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
