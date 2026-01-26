import api from './api';

export interface FilterOptions {
  years: number[];
  leagues: { id: number; name: string }[];
  splits: string[];
}

export async function getFilterOptions(params?: {
  year?: number;
  league?: number;
  split?: string;
}): Promise<FilterOptions> {
  const { data } = await api.get('/filter-options/', { params });
  return data;
}
