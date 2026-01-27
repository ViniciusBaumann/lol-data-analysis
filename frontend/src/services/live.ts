import api from './api';
import { LiveGamesResponse } from '@/types';

export async function getLiveGames(): Promise<LiveGamesResponse> {
  const res = await api.get<LiveGamesResponse>('/live/');
  return res.data;
}
