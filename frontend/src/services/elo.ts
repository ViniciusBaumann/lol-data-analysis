import api from './api';
import type { EloRating } from '@/types';

export async function getEloRatings(leagueId?: number): Promise<EloRating[]> {
  const { data } = await api.get('/elo/', {
    params: leagueId ? { league: leagueId } : undefined,
  });
  return data;
}
