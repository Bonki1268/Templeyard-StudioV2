import {
  apiErrorSchema,
  assetResponseSchema,
  photoResponseSchema,
  seriesListResponseSchema,
  seriesResponseSchema,
  templeSearchResponseSchema,
  videoDetailResponseSchema,
  videoResponseSchema,
  type Asset,
  type CreatePhotoInput,
  type CreateSeriesInput,
  type ImageUpload,
  type Photo,
  type Series,
  type TempleSummary,
  type UpdatePhotoInput,
  type UpdateVideoInput,
  type Video,
  type VideoDetail,
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

export async function searchTemples(q: string, signal?: AbortSignal): Promise<TempleSummary[]> {
  const body = await request(`/api/temples?${new URLSearchParams({ q, limit: '20' })}`, { signal });
  return templeSearchResponseSchema.parse(body).temples;
}

export async function postVideo(input: { seriesId: string; templeId: string }): Promise<Video> {
  const body = await request('/api/videos', { method: 'POST', body: JSON.stringify(input) });
  return videoResponseSchema.parse(body).video;
}

export async function fetchVideoDetail(videoId: string): Promise<VideoDetail> {
  return videoDetailResponseSchema.parse(await request(`/api/videos/${encodeURIComponent(videoId)}`));
}

export async function patchVideo(videoId: string, input: UpdateVideoInput): Promise<Video> {
  const body = await request(`/api/videos/${encodeURIComponent(videoId)}`, { method: 'PATCH', body: JSON.stringify(input) });
  return videoResponseSchema.parse(body).video;
}

/** 原圖只送到本機後端，存在 data/assets/originals/，永遠不會送往雲端 */
export async function postOriginalPhoto(videoId: string, image: ImageUpload): Promise<Asset> {
  const body = await request(`/api/videos/${encodeURIComponent(videoId)}/photos/originals`, {
    method: 'POST',
    body: JSON.stringify(image),
  });
  return assetResponseSchema.parse(body).asset;
}

export async function postPhoto(videoId: string, input: CreatePhotoInput): Promise<Photo> {
  const body = await request(`/api/videos/${encodeURIComponent(videoId)}/photos`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return photoResponseSchema.parse(body).photo;
}

export async function patchPhoto(videoId: string, photoId: string, input: UpdatePhotoInput): Promise<Photo> {
  const body = await request(`/api/videos/${encodeURIComponent(videoId)}/photos/${encodeURIComponent(photoId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return photoResponseSchema.parse(body).photo;
}

/** 本機後端上的檔案網址 */
export function assetUrl(assetId: string): string {
  return `/api/assets/${encodeURIComponent(assetId)}`;
}
