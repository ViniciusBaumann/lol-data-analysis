import { useState, useEffect, useCallback } from 'react';
import { Team, TeamDetail, TeamStats, ObjectiveStats, Match, PaginatedResponse, FilterParams, LeagueStandings } from '@/types';
import { getTeams, getTeam, getTeamStats, getTeamMatches, getTeamObjectives, getStandings } from '@/services/teams';

export function useTeams(params?: { search?: string; leagues?: number; page?: number }) {
  const [data, setData] = useState<PaginatedResponse<Team> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getTeams(params);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch teams');
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(params)]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

export function useTeamDetail(id: number | null) {
  const [data, setData] = useState<TeamDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id === null) return;
    setLoading(true);
    setError(null);
    getTeam(id)
      .then(setData)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to fetch team'))
      .finally(() => setLoading(false));
  }, [id]);

  return { data, loading, error };
}

export function useTeamStats(id: number | null, filters?: FilterParams) {
  const [data, setData] = useState<TeamStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id === null) return;
    setLoading(true);
    setError(null);
    getTeamStats(id, filters)
      .then(setData)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to fetch stats'))
      .finally(() => setLoading(false));
  }, [id, JSON.stringify(filters)]);

  return { data, loading, error };
}

export function useTeamMatches(id: number | null, params?: FilterParams & { page?: number }) {
  const [data, setData] = useState<PaginatedResponse<Match> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id === null) return;
    setLoading(true);
    setError(null);
    getTeamMatches(id, params)
      .then(setData)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to fetch matches'))
      .finally(() => setLoading(false));
  }, [id, JSON.stringify(params)]);

  return { data, loading, error };
}

export function useTeamObjectives(id: number | null, filters?: FilterParams) {
  const [data, setData] = useState<ObjectiveStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id === null) return;
    setLoading(true);
    setError(null);
    getTeamObjectives(id, filters)
      .then(setData)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to fetch objectives'))
      .finally(() => setLoading(false));
  }, [id, JSON.stringify(filters)]);

  return { data, loading, error };
}

export function useStandings(params?: { league?: number; year?: number; split?: string; search?: string }) {
  const [data, setData] = useState<LeagueStandings[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getStandings(params);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch standings');
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(params)]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, error, refetch: fetch };
}
