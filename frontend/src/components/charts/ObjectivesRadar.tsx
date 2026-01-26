import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts';

interface ObjectivesRadarProps {
  data: {
    dragons: number;
    barons: number;
    towers: number;
    heralds: number;
    voidgrubs: number;
  };
  label?: string;
}

export function ObjectivesRadar({ data, label = 'Objetivos' }: ObjectivesRadarProps) {
  const chartData = [
    { subject: 'Dragoes', value: data.dragons },
    { subject: 'Baroes', value: data.barons },
    { subject: 'Torres', value: data.towers },
    { subject: 'Arautos', value: data.heralds },
    { subject: 'Voidgrubs', value: data.voidgrubs },
  ];

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <h3 className="text-sm font-medium text-foreground mb-4">{label}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <RadarChart data={chartData}>
          <PolarGrid stroke="hsl(217 33% 25%)" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: 'hsl(215 20% 65%)', fontSize: 12 }} />
          <PolarRadiusAxis tick={{ fill: 'hsl(215 20% 65%)', fontSize: 10 }} />
          <Radar name={label} dataKey="value" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.3} />
          <Tooltip
            contentStyle={{ backgroundColor: 'hsl(222 47% 8%)', border: '1px solid hsl(217 33% 17%)', borderRadius: '8px', color: '#fff' }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
