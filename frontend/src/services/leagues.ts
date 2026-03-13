import api from './api';
import { League, PaginatedResponse, ScheduledEventsResponse } from '@/types';

export async function getLeagues(params?: { search?: string; page?: number; year?: number }): Promise<PaginatedResponse<League>> {
  const { data } = await api.get('/leagues/', { params });
  return data;
}

export async function getLeagueSchedule(leagueId: number): Promise<ScheduledEventsResponse> {
  const { data } = await api.get(`/leagues/${leagueId}/schedule/`);
  return data;
}
