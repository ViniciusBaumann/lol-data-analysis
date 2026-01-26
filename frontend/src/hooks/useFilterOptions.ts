import { useState, useEffect, useCallback } from 'react';
import { getFilterOptions, FilterOptions } from '@/services/filterOptions';

const EMPTY: FilterOptions = { years: [], leagues: [], splits: [] };

export function useFilterOptions(params?: {
  year?: number;
  league?: number;
  split?: string;
}) {
  const [data, setData] = useState<FilterOptions>(EMPTY);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getFilterOptions(params);
      setData(result);
    } catch {
      setData(EMPTY);
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(params)]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading };
}
