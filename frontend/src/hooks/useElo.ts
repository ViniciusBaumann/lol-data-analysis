import { useState, useEffect } from 'react';
import type { EloRating } from '@/types';
import { getEloRatings } from '@/services/elo';

export function useEloRatings(leagueId: number | null) {
  const [data, setData] = useState<EloRating[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (leagueId === null) return;
    setLoading(true);
    setError(null);
    getEloRatings(leagueId)
      .then(setData)
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Failed to fetch ELO ratings')
      )
      .finally(() => setLoading(false));
  }, [leagueId]);

  return { data, loading, error };
}
