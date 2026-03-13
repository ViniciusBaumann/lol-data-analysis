export interface ImportResult {
  id: number;
  year: number;
  source: string;
  rows_processed: number;
  matches_created: number;
  matches_skipped: number;
  errors: string;
  status: string;
  started_at: string;
  completed_at: string | null;
}
