import api from './api';
import { MatchupResponse } from '@/types';

export async function getChampionMatchups(params: {
  mode: string;
  champion?: string;
  position?: string;
  target_position?: string;
  min_games?: number;
}): Promise<MatchupResponse> {
  const res = await api.get<MatchupResponse>('/champion-matchups/', { params });
  return res.data;
}
