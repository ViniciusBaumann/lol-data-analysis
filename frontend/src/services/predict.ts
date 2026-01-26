import api from './api';
import { PredictionResponse } from '@/types';

export async function getPrediction(
  team1: number,
  team2: number
): Promise<PredictionResponse> {
  const res = await api.get<PredictionResponse>('/predict/', {
    params: { team1, team2 },
  });
  return res.data;
}
