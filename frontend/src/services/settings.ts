import api from './api';

export interface ImportResult {
  id: number;
  year: number;
  source: string;
  status: string;
  rows_processed: number;
  matches_created: number;
  matches_skipped: number;
  errors: string;
  started_at: string;
  completed_at: string | null;
}

export async function triggerImport(year: number, download = true): Promise<ImportResult> {
  const { data } = await api.post('/import/', { year, download });
  return data;
}
