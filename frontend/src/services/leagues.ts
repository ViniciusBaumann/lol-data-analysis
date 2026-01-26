import api from './api';
import { League, PaginatedResponse, ScheduleResponse } from '@/types';

export async function getLeagues(params?: { search?: string; page?: number; year?: number }): Promise<PaginatedResponse<League>> {
  const { data } = await api.get('/leagues/', { params });
  return data;
}

export async function getLeagueSchedule(leagueId: number): Promise<ScheduleResponse> {
  const { data } = await api.get(`/leagues/${leagueId}/schedule/`);
  return data;
}
