import { useState, useEffect, useRef, useCallback } from 'react';
import { LiveGame, ScheduleMatch, CompareData } from '@/types';
import { useLiveGames } from './useLiveGames';
import { getSchedule, getLiveGames } from '@/services/live';
import { getCompareData } from '@/services/compare';

// Polling interval for live game detail (5 seconds)
const LIVE_DETAIL_POLL_INTERVAL = 5_000;

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
  const {
    games: initialGames,
    loading: initialLoading,
    error,
    lastUpdated: initialLastUpdated,
  } = useLiveGames();

  // Local state for faster polling on live game detail
  const [liveGames, setLiveGames] = useState<LiveGame[]>([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [localLastUpdated, setLocalLastUpdated] = useState<Date | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // State for scheduled match
  const [scheduleMatch, setScheduleMatch] = useState<ScheduleMatch | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [compareData, setCompareData] = useState<CompareData | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

  // Sync initial games to local state
  useEffect(() => {
    if (initialGames.length > 0) {
      setLiveGames(initialGames);
      setLocalLastUpdated(initialLastUpdated);
    }
  }, [initialGames, initialLastUpdated]);

  // Fast polling function for live game detail (5 seconds)
  const fetchLiveData = useCallback(async (silent: boolean = true) => {
    if (!silent) setLocalLoading(true);
    try {
      const data = await getLiveGames();
      setLiveGames(data.games);
      setLocalLastUpdated(new Date());
    } catch {
      // Keep previous data on error
    } finally {
      if (!silent) setLocalLoading(false);
    }
  }, []);

  // Determine the current game
  const games = liveGames.length > 0 ? liveGames : initialGames;
  const game = games.find(g => g.match_id === matchId);
  const isLiveGame = !!game;

  // Set up fast polling when viewing a live game
  useEffect(() => {
    if (isLiveGame) {
      // Start fast polling for live game detail
      pollIntervalRef.current = setInterval(() => fetchLiveData(true), LIVE_DETAIL_POLL_INTERVAL);
      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      };
    }
  }, [isLiveGame, fetchLiveData]);

  // Fetch schedule if game not found in live games
  const loading = initialLoading || localLoading;

  useEffect(() => {
    if (!loading && !game && matchId) {
      setScheduleLoading(true);
      getSchedule()
        .then((data) => {
          const found = [...(data.live || []), ...data.upcoming, ...data.completed].find(m => m.match_id === matchId);
          setScheduleMatch(found || null);

          if (found && found.teams[0]?.db_id && found.teams[1]?.db_id) {
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
  }, [loading, game, matchId]);

  // Combined state
  const lastUpdated = localLastUpdated || initialLastUpdated;
  const refresh = useCallback(() => fetchLiveData(false), [fetchLiveData]);

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
