import api from './api';
import { CompareData } from '@/types';

export async function getCompareData(
  team1: number,
  team2: number,
  params?: { year?: number; split?: string }
): Promise<CompareData> {
  const { data } = await api.get('/compare/', {
    params: { team1, team2, ...params },
  });
  return data;
}
