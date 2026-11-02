import { useQuery } from '@tanstack/react-query';
import { fetchSeriesList } from '../../api/client';

export const SERIES_LIST_KEY = ['series'] as const;

export function useSeriesList() {
  return useQuery({ queryKey: SERIES_LIST_KEY, queryFn: fetchSeriesList });
}
