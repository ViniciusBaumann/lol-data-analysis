import api from './api';
import { DashboardData } from '@/types';

export async function getDashboardData(year?: number): Promise<DashboardData> {
  const { data } = await api.get('/dashboard/', { params: year ? { year } : {} });
  return data;
}
