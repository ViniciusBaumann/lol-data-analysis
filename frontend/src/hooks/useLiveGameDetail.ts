import { useState, useEffect, useCallback, useRef } from 'react';
import { LiveGame, ScheduleMatch, CompareData } from '@/types';
import { getSchedule, getLiveGames, getLiveMatchDetail } from '@/services/live';
import { getCompareData } from '@/services/compare';

interface UseLiveGameDetailResult {
  game: LiveGame | undefined;
  scheduleMatch: ScheduleMatch | null;
  compareData: CompareData | null;
  loading: boolean;
  scheduleLoading: boolean;
  compareLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
}

export function useLiveGameDetail(matchId: string | undefined): UseLiveGameDetailResult {
  const [game, setGame] = useState<LiveGame | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // State for scheduled match (fallback when game not found at all)
  const [scheduleMatch, setScheduleMatch] = useState<ScheduleMatch | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [compareData, setCompareData] = useState<CompareData | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

  // Prevent duplicate fetches
  const fetchInProgress = useRef(false);
  const initialFetchDone = useRef(false);

  // Fetch match data directly by ID (more reliable than filtering live games)
  const fetchMatchData = useCallback(async (showLoading = true, isManualRefresh = false) => {
    if (!matchId || fetchInProgress.current) return;
    fetchInProgress.current = true;

    if (showLoading) setLoading(true);
    if (isManualRefresh) setIsRefreshing(true);
    setError(null);

    try {
      // Try to fetch the match directly by ID
      const matchData = await getLiveMatchDetail(matchId);
      setGame(matchData);
      setLastUpdated(new Date());
      setScheduleMatch(null); // Clear schedule match if we got live data
    } catch (err) {
      console.error(`[useLiveGameDetail] Fetch direto falhou para match ${matchId}:`, err);
      // If direct fetch fails, try getting from live games list
      try {
        const liveData = await getLiveGames(false);
        const foundGame = liveData.games.find(g => g.match_id === matchId);
        if (foundGame) {
          setGame(foundGame);
          setLastUpdated(new Date());
          setScheduleMatch(null);
        } else {
          console.warn(`[useLiveGameDetail] Match ${matchId} nao encontrado na lista de jogos ao vivo`);
          // Game not in live list, will trigger schedule fallback
          setGame(undefined);
        }
      } catch (listErr) {
        console.error(`[useLiveGameDetail] Fallback para lista tambem falhou:`, listErr);
        const message = err instanceof Error ? err.message : 'Falha ao carregar dados';
        setError(message);
        setGame(undefined);
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
      fetchInProgress.current = false;
    }
  }, [matchId]);

  // Initial fetch on mount
  useEffect(() => {
    if (!initialFetchDone.current && matchId) {
      initialFetchDone.current = true;
      fetchMatchData(true);
    }
  }, [matchId, fetchMatchData]);

  // Auto-refresh every 10 seconds when viewing a game
  useEffect(() => {
    if (!matchId) return;

    const intervalId = setInterval(() => {
      fetchMatchData(false); // Don't show loading spinner on auto-refresh
    }, 10000);

    return () => clearInterval(intervalId);
  }, [matchId, fetchMatchData]);

  // Fetch schedule data if game not found
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
    fetchMatchData(false, true);
  }, [fetchMatchData]);

  return {
    game,
    scheduleMatch,
    compareData,
    loading,
    scheduleLoading,
    compareLoading,
    isRefreshing,
    error,
    lastUpdated,
    refresh,
  };
}
