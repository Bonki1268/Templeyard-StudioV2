import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type APIRequestContext } from '@playwright/test';
import {
  VIDEO_MODELS,
  assetResponseSchema,
  photoResponseSchema,
  seriesResponseSchema,
  templeBoardResponseSchema,
  templeSearchResponseSchema,
  videoDetailResponseSchema,
  videoResponseSchema,
  type CreateSeriesInput,
  type TempleBoard,
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

// ── 寺廟定裝版（第 5 階段） ──

/** 同意這次的費用，回傳同意憑證 */
export async function consentViaApi(request: APIRequestContext, videoId: string, units: number, model = 'nano-banana-pro'): Promise<string> {
  const response = await request.post(`/api/videos/${videoId}/consents`, { data: { items: [{ model, units }] } });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { consentToken: string }).consentToken;
}

export async function fetchBoard(request: APIRequestContext, videoId: string): Promise<TempleBoard> {
  const response = await request.get(`/api/videos/${videoId}/temple-board`);
  expect(response.status()).toBe(200);
  return templeBoardResponseSchema.parse(await response.json()).board;
}

/** 等定裝版所有視角都產生完成（假的雲端第 2 次查詢就完成） */
export async function waitBoardReady(request: APIRequestContext, videoId: string): Promise<TempleBoard> {
  await expect
    .poll(async () => (await fetchBoard(request, videoId)).views.every((view) => view.state === 'ready'), { timeout: 15_000 })
    .toBe(true);
  return fetchBoard(request, videoId);
}

/** 上傳指定視角的照片、同意費用、產生定裝版，等到完成 */
export async function generateBoardViaApi(
  request: APIRequestContext,
  videoId: string,
  options: { viewKey?: string; inferredViewKeys?: string[] } = {},
): Promise<TempleBoard> {
  const photo = await uploadPhotoViaApi(request, videoId, { viewKey: options.viewKey ?? 'front_overview' });
  expect(photo.status()).toBe(201);
  const inferred = options.inferredViewKeys ?? [];
  const response = await request.post(`/api/videos/${videoId}/temple-board/generate`, {
    data: { inferredViewKeys: inferred, consentToken: await consentViaApi(request, videoId, 1 + inferred.length) },
  });
  expect(response.status()).toBe(202);
  return waitBoardReady(request, videoId);
}
