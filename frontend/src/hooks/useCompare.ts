import { useState, useEffect } from 'react';
import { CompareData } from '@/types';
import { getCompareData } from '@/services/compare';

export function useCompare(
  team1: number | null,
  team2: number | null,
  params?: { year?: number; split?: string }
) {
  const [data, setData] = useState<CompareData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (team1 === null || team2 === null) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    getCompareData(team1, team2, params)
      .then(setData)
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : 'Failed to fetch comparison'
        )
      )
      .finally(() => setLoading(false));
  }, [team1, team2, params?.year, params?.split]);

  return { data, loading, error };
}
