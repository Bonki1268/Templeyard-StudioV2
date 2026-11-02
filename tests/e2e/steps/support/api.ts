import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type APIRequestContext } from '@playwright/test';
import {
  VIDEO_MODELS,
  assetResponseSchema,
  photoResponseSchema,
  seriesResponseSchema,
  templeSearchResponseSchema,
  videoDetailResponseSchema,
  videoResponseSchema,
  type CreateSeriesInput,
  type VideoDetail,
  type VideoModelKey,
} from '@templeyard/shared';

// 情境測試共用的 API 操作（不是 step 定義）

const here = path.dirname(fileURLToPath(import.meta.url));
export const photoFixturesDir = path.resolve(here, '..', '..', 'fixtures', 'photos');

export function photoFixture(name: string): string {
  return path.join(photoFixturesDir, name);
}

export function photoFixtureBase64(name = '廟前全景.png'): string {
  return readFileSync(photoFixture(name)).toString('base64');
}

/** 每個場景用不同的名稱，平行執行時不會互相影響 */
export function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function videoModelKey(label: string): VideoModelKey {
  const model = VIDEO_MODELS.find((m) => m.label === label);
  if (!model) throw new Error(`沒有這個影片模型：${label}`);
  return model.key;
}

export async function createSeriesViaApi(
  request: APIRequestContext,
  input: Partial<CreateSeriesInput> = {},
): Promise<{ id: string; name: string }> {
  const response = await request.post('/api/series', {
    data: {
      name: uniqueName('影片系列'),
      visualStyle: '寫實電影感、清晨暖光',
      durationSec: 30,
      direction: '歷史故事',
      defaultImageModel: 'nano-banana-pro',
      defaultVideoModel: 'gemini-omni-1.1-flash',
      ...input,
    },
  });
  expect(response.status()).toBe(201);
  const { series } = seriesResponseSchema.parse(await response.json());
  return { id: series.id, name: series.name };
}

/** 依登記名稱找寺廟編號（名稱要完全相同） */
export async function templeIdByName(request: APIRequestContext, name: string): Promise<string> {
  const response = await request.get('/api/temples', { params: { q: name } });
  expect(response.status()).toBe(200);
  const { temples } = templeSearchResponseSchema.parse(await response.json());
  const temple = temples.find((t) => t.name === name);
  if (!temple) throw new Error(`寺廟資料庫找不到：${name}`);
  return temple.id;
}

export async function createVideoViaApi(request: APIRequestContext, seriesId: string, templeName: string) {
  const templeId = await templeIdByName(request, templeName);
  const response = await request.post('/api/videos', { data: { seriesId, templeId } });
  return { response, templeId };
}

export async function videoIdFrom(response: { json: () => Promise<unknown> }): Promise<string> {
  return videoResponseSchema.parse(await response.json()).video.id;
}

export async function fetchVideoDetail(request: APIRequestContext, videoId: string): Promise<VideoDetail> {
  const response = await request.get(`/api/videos/${videoId}`);
  expect(response.status()).toBe(200);
  return videoDetailResponseSchema.parse(await response.json());
}

export async function uploadOriginalViaApi(request: APIRequestContext, videoId: string) {
  return request.post(`/api/videos/${videoId}/photos/originals`, {
    data: { mime: 'image/png', dataBase64: photoFixtureBase64() },
  });
}

/** 走完原圖＋去識別圖兩個端點；回傳建立照片的回應 */
export async function uploadPhotoViaApi(request: APIRequestContext, videoId: string, overrides: Record<string, unknown> = {}) {
  const original = await uploadOriginalViaApi(request, videoId);
  expect(original.status()).toBe(201);
  const { asset } = assetResponseSchema.parse(await original.json());
  return request.post(`/api/videos/${videoId}/photos`, {
    data: {
      originalAssetId: asset.id,
      deidentified: { mime: 'image/png', dataBase64: photoFixtureBase64() },
      deidBoxes: [],
      ...overrides,
    },
  });
}

export async function photoFrom(response: { json: () => Promise<unknown> }) {
  return photoResponseSchema.parse(await response.json()).photo;
}
