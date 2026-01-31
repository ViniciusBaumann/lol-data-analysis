import api from './api';
import { LiveGamesResponse, ScheduleResponse, LiveGame } from '@/types';

export async function getLiveGames(minimal = false): Promise<LiveGamesResponse> {
  const res = await api.get<LiveGamesResponse>('/live/', {
    params: minimal ? { minimal: 'true' } : undefined,
  });
  return res.data;
}

export async function getLiveMatchDetail(matchId: string): Promise<LiveGame> {
  const res = await api.get<LiveGame>(`/live/${matchId}/`);
  return res.data;
}

export async function getSchedule(): Promise<ScheduleResponse> {
  const res = await api.get<ScheduleResponse>('/schedule/');
  return res.data;
}
