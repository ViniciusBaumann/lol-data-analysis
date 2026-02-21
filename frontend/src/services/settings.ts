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
  try {
    const { data } = await api.post('/import/', { year, download });
    console.log(`[settings] Import ${year} concluido:`, {
      matches_created: data.matches_created,
      matches_skipped: data.matches_skipped,
      errors: data.errors || 'nenhum',
    });
    return data;
  } catch (err) {
    console.error(`[settings] Import ${year} falhou:`, err);
    throw err;
  }
}
