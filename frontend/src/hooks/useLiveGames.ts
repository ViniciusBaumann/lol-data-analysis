import { useState, useEffect, useRef, useCallback } from 'react';
import { LiveGame, ScheduleMatch } from '@/types';
import { getLiveGames, getSchedule } from '@/services/live';

const POLL_INTERVAL = 60_000; // 1 minute for list view

export function useLiveGames() {
  const [games, setGames] = useState<LiveGame[]>([]);
  const [upcoming, setUpcoming] = useState<ScheduleMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const initialFetchDone = useRef(false);

  const fetchGames = useCallback(async (silent: boolean) => {
    if (!silent) setLoading(true);
    try {
      // Fetch both live games and schedule in parallel
      const [liveData, scheduleData] = await Promise.all([
        getLiveGames(true),
        getSchedule(),
      ]);
      setGames(liveData.games);
      setUpcoming(scheduleData.upcoming || []);
      setLastUpdated(new Date());
      setError(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch live games';
      setError(message);
      // Keep previous games on poll failure
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    if (!initialFetchDone.current) {
      initialFetchDone.current = true;
      fetchGames(false);
    }
  }, [fetchGames]);

  // Polling
  useEffect(() => {
    const id = setInterval(() => fetchGames(true), POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchGames]);

  const refresh = useCallback(() => fetchGames(false), [fetchGames]);

  return { games, upcoming, loading, error, lastUpdated, refresh };
}
