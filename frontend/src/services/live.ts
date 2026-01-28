import api from './api';
import { LiveGamesResponse, ScheduleResponse } from '@/types';

export async function getLiveGames(): Promise<LiveGamesResponse> {
  const res = await api.get<LiveGamesResponse>('/live/');
  return res.data;
}

export async function getSchedule(): Promise<ScheduleResponse> {
  const res = await api.get<ScheduleResponse>('/schedule/');
  return res.data;
}
