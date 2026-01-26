import { useState, useEffect, useCallback } from 'react';
import { Match, MatchDetail, PaginatedResponse } from '@/types';
import { getMatches, getMatch } from '@/services/matches';

export function useMatches(params?: { league?: number; year?: number; split?: string; playoffs?: boolean; search?: string; page?: number; ordering?: string }) {
  const [data, setData] = useState<PaginatedResponse<Match> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getMatches(params);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch matches');
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(params)]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

export function useMatchDetail(id: number | null) {
  const [data, setData] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id === null) return;
    setLoading(true);
    setError(null);
    getMatch(id)
      .then(setData)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to fetch match'))
      .finally(() => setLoading(false));
  }, [id]);

  return { data, loading, error };
}
