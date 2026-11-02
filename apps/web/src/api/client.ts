import type { CreateSeriesInput, Series } from '@templeyard/shared';

/** API 回應錯誤：message 與各欄位的說明 */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export async function fetchSeriesList(): Promise<Series[]> {
  throw new Error('尚未實作');
}

export async function postSeries(_input: CreateSeriesInput): Promise<Series> {
  throw new Error('尚未實作');
}
