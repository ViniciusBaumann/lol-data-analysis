import { memo } from 'react';
import { Skull, TowerControl, Flame, Crown } from 'lucide-react';
import { DraftPredictions } from '@/types';

interface ModelEstimatesPanelProps {
  predictions: DraftPredictions;
}

function ModelEstimatesPanelComponent({ predictions }: ModelEstimatesPanelProps) {
  const stats = [
    { icon: <Skull size={14} className="text-red-400" />, label: 'Kills', value: predictions.total_kills },
    { icon: <TowerControl size={14} className="text-sky-400" />, label: 'Towers', value: predictions.total_towers },
    { icon: <Flame size={14} className="text-orange-400" />, label: 'Dragons', value: predictions.total_dragons },
    { icon: <Crown size={14} className="text-purple-400" />, label: 'Barons', value: predictions.total_barons },
  ];

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <p className="text-xs font-semibold text-zinc-500 mb-1">
        Estimativas do Modelo
      </p>
      <p className="text-[10px] text-zinc-600 mb-3">
        Previsao de objetivos totais da partida baseada no draft e historico dos times.
      </p>
      <div className="grid grid-cols-4 gap-3 text-center">
        {stats.map((s) => (
          <div key={s.label}>
            <div className="flex items-center justify-center gap-1 mb-1">{s.icon}</div>
            <p className="text-lg font-bold text-zinc-100">{s.value}</p>
            <p className="text-[9px] text-zinc-600 uppercase">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export const ModelEstimatesPanel = memo(ModelEstimatesPanelComponent);
