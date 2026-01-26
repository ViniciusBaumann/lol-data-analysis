import { useState, useEffect } from 'react';
import { League, PaginatedResponse, ScheduledMatch } from '@/types';
import { getLeagues, getLeagueSchedule } from '@/services/leagues';

export function useLeagues(params?: { year?: number }) {
  const [data, setData] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getLeagues({ page: 1, ...params })
      .then(result => setData(result.results))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [JSON.stringify(params)]);

  return { data, loading };
}

export function useLeagueSchedule(leagueId: number | null) {
  const [data, setData] = useState<ScheduledMatch[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (leagueId === null) return;
    setLoading(true);
    getLeagueSchedule(leagueId)
      .then((result) => setData(result.events))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [leagueId]);

  return { data, loading };
}
