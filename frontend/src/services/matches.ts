import api from './api';
import { Match, MatchDetail, PaginatedResponse } from '@/types';

export async function getMatches(params?: { league?: number; year?: number; split?: string; playoffs?: boolean; search?: string; page?: number; ordering?: string }): Promise<PaginatedResponse<Match>> {
  const { data } = await api.get('/matches/', { params });
  return data;
}

export async function getMatch(id: number): Promise<MatchDetail> {
  const { data } = await api.get(`/matches/${id}/`);
  return data;
}
