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
          <PolarGrid stroke="#2a2a2a" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: '#888', fontSize: 12 }} />
          <PolarRadiusAxis tick={{ fill: '#888', fontSize: 10 }} />
          <Radar name={label} dataKey="value" stroke="#00d4aa" fill="#00d4aa" fillOpacity={0.3} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px', color: '#f5f5f5' }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
