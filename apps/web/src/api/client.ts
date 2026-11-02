import {
  apiErrorSchema,
  seriesListResponseSchema,
  seriesResponseSchema,
  type CreateSeriesInput,
  type Series,
} from '@templeyard/shared';

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

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** 呼叫本機後端；非 2xx 時丟出 ApiRequestError */
async function request(path: string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiRequestError('連不上本機後端，請確認 pnpm dev 有在執行', 0);
  }
  const body = await readJson(response);
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    throw parsed.success
      ? new ApiRequestError(parsed.data.message, response.status, parsed.data.fieldErrors)
      : new ApiRequestError(`後端回應錯誤（${response.status}）`, response.status);
  }
  return body;
}

export async function fetchSeriesList(): Promise<Series[]> {
  return seriesListResponseSchema.parse(await request('/api/series')).series;
}

export async function postSeries(input: CreateSeriesInput): Promise<Series> {
  const body = await request('/api/series', { method: 'POST', body: JSON.stringify(input) });
  return seriesResponseSchema.parse(body).series;
}
