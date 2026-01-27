import api from './api';
import { ChampionInfo, DraftPredictionResponse } from '@/types';

export async function getChampions(params?: {
  position?: string;
  search?: string;
}): Promise<ChampionInfo[]> {
  const res = await api.get<ChampionInfo[]>('/champions/', { params });
  return res.data;
}

export async function getDraftPrediction(
  draft: Record<string, string>,
  blueTeamId?: number | null,
  redTeamId?: number | null
): Promise<DraftPredictionResponse> {
  const payload: Record<string, string | number> = { ...draft };
  if (blueTeamId != null) payload.blue_team = blueTeamId;
  if (redTeamId != null) payload.red_team = redTeamId;
  const res = await api.post<DraftPredictionResponse>('/draft-predict/', payload);
  return res.data;
}
