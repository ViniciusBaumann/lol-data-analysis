import { useState, useEffect, useCallback, useRef } from 'react';
import { ChampionInfo, MatchupResponse } from '@/types';
import { getChampions } from '@/services/draft';
import { getChampionMatchups } from '@/services/matchups';

export type MatchupMode = 'direct' | 'indirect' | 'synergy' | 'duos';

export function useChampionMatchups() {
  const [champion, setChampion] = useState('');
  const [position, setPosition] = useState('');
  const [mode, setMode] = useState<MatchupMode>('direct');
  const [targetPosition, setTargetPosition] = useState('');
  const [minGames, setMinGames] = useState(3);

  const [champions, setChampions] = useState<ChampionInfo[]>([]);
  const [championsLoading, setChampionsLoading] = useState(false);

  const [data, setData] = useState<MatchupResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load champion list on mount
  useEffect(() => {
    setChampionsLoading(true);
    getChampions()
      .then(setChampions)
      .catch(() => setChampions([]))
      .finally(() => setChampionsLoading(false));
  }, []);

  const fetchMatchups = useCallback(() => {
    if (mode !== 'duos' && (!champion || !position)) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    const params: Record<string, string | number> = { mode, min_games: minGames };
    if (mode !== 'duos') {
      params.champion = champion;
      params.position = position;
    }
    if (targetPosition && (mode === 'indirect' || mode === 'synergy')) {
      params.target_position = targetPosition;
    }

    getChampionMatchups(params as Parameters<typeof getChampionMatchups>[0])
      .then((res) => {
        if (!controller.signal.aborted) setData(res);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(
            err?.response?.data?.error || 'Failed to fetch matchup data'
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [champion, position, mode, targetPosition, minGames]);

  // Auto-fetch when params change
  useEffect(() => {
    const cleanup = fetchMatchups();
    return cleanup;
  }, [fetchMatchups]);

  return {
    champion,
    setChampion,
    position,
    setPosition,
    mode,
    setMode,
    targetPosition,
    setTargetPosition,
    minGames,
    setMinGames,
    champions,
    championsLoading,
    data,
    loading,
    error,
  };
}
