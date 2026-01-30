import { useState, useEffect, useCallback, useRef } from 'react';
import { LiveGame, ScheduleMatch, CompareData } from '@/types';
import { getSchedule, getLiveGames } from '@/services/live';
import { getCompareData } from '@/services/compare';

interface UseLiveGameDetailResult {
  game: LiveGame | undefined;
  scheduleMatch: ScheduleMatch | null;
  compareData: CompareData | null;
  loading: boolean;
  scheduleLoading: boolean;
  compareLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
}

export function useLiveGameDetail(matchId: string | undefined): UseLiveGameDetailResult {
  const [games, setGames] = useState<LiveGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // State for scheduled match (fallback when game not live)
  const [scheduleMatch, setScheduleMatch] = useState<ScheduleMatch | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [compareData, setCompareData] = useState<CompareData | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

  // Prevent duplicate fetches
  const fetchInProgress = useRef(false);
  const initialFetchDone = useRef(false);

  // Fetch live games data (full data, no polling)
  const fetchLiveData = useCallback(async (showLoading = true) => {
    if (fetchInProgress.current) return;
    fetchInProgress.current = true;

    if (showLoading) setLoading(true);
    setError(null);

    try {
      const data = await getLiveGames(false); // Full data
      setGames(data.games);
      setLastUpdated(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao carregar dados';
      setError(message);
    } finally {
      setLoading(false);
      fetchInProgress.current = false;
    }
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    if (!initialFetchDone.current && matchId) {
      initialFetchDone.current = true;
      fetchLiveData(true);
    }
  }, [matchId, fetchLiveData]);

  // Auto-refresh every 30 seconds when viewing a live game
  useEffect(() => {
    if (!matchId) return;

    const intervalId = setInterval(() => {
      fetchLiveData(false); // Don't show loading spinner on auto-refresh
    }, 10000); // 10 seconds

    return () => clearInterval(intervalId);
  }, [matchId, fetchLiveData]);

  // Find the current game
  const game = games.find(g => g.match_id === matchId);

  // Fetch schedule data if game not found in live games
  useEffect(() => {
    if (!loading && !game && matchId && !scheduleMatch) {
      setScheduleLoading(true);
      getSchedule()
        .then((data) => {
          const allMatches = [
            ...(data.live || []),
            ...(data.upcoming || []),
            ...(data.completed || []),
          ];
          const found = allMatches.find(m => m.match_id === matchId);
          setScheduleMatch(found || null);

          // Fetch compare data if teams have db_ids
          if (found?.teams[0]?.db_id && found?.teams[1]?.db_id) {
            setCompareLoading(true);
            getCompareData(found.teams[0].db_id, found.teams[1].db_id)
              .then(setCompareData)
              .catch(() => setCompareData(null))
              .finally(() => setCompareLoading(false));
          }
        })
        .catch(() => setScheduleMatch(null))
        .finally(() => setScheduleLoading(false));
    }
  }, [loading, game, matchId, scheduleMatch]);

  // Manual refresh function
  const refresh = useCallback(() => {
    fetchLiveData(false);
  }, [fetchLiveData]);

  return {
    game,
    scheduleMatch,
    compareData,
    loading,
    scheduleLoading,
    compareLoading,
    error,
    lastUpdated,
    refresh,
  };
}
