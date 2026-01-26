import { useState, useEffect } from 'react';
import { PredictionResponse } from '@/types';
import { getPrediction } from '@/services/predict';

export function usePrediction(
  team1: number | null,
  team2: number | null
) {
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (team1 === null || team2 === null) {
      setPrediction(null);
      return;
    }

    setLoading(true);
    setError(null);

    getPrediction(team1, team2)
      .then(setPrediction)
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : 'Failed to fetch prediction'
        )
      )
      .finally(() => setLoading(false));
  }, [team1, team2]);

  return { prediction, loading, error };
}
