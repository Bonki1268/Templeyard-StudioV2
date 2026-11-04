import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import {
  apiErrorSchema,
  assetResponseSchema,
  photoResponseSchema,
  seriesResponseSchema,
  videoDetailResponseSchema,
  videoResponseSchema,
  type DeidBox,
} from '@templeyard/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { openDatabase, type AppDatabase } from '../db/client.js';
import { assets } from '../db/schema.js';
import type { Clock } from '../series/repository.js';
import { importTemples } from '../temples/import.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const sampleCsv = readFileSync(path.join(here, '..', 'temples', '__fixtures__', 'temples-sample.csv'), 'utf8');

const TEMPLE_A = 'A0000000-0000-0000-0000-000000000001';
const TEMPLE_B = 'A0000000-0000-0000-0000-000000000002';

// 1×1 的 PNG：原圖與去識別圖用不同的內容，才分得出是哪一個檔案
const ORIGINAL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const DEID_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const faceBox: DeidBox = { id: 'auto-1', kind: 'face', source: 'auto', x: 0.1, y: 0.1, width: 0.2, height: 0.3, cancelled: false };

function fixedClock(): Clock {
  let minutes = 0;
  let id = 0;
  return {
    now: () => new Date(Date.UTC(2026, 10, 2, 9, minutes++)),
    newId: () => `id-${++id}`,
  };
}

let app: FastifyInstance | undefined;
let db: AppDatabase | undefined;
let assetsDir = '';

function currentApp(): FastifyInstance {
  if (!app) throw new Error('app 沒有建立');
  return app;
}

function currentDb(): AppDatabase {
  if (!db) throw new Error('資料庫沒有建立');
  return db;
}

beforeEach(() => {
  assetsDir = mkdtempSync(path.join(tmpdir(), 'templeyard-assets-'));
  db = openDatabase(':memory:');
  importTemples(db, sampleCsv);
  app = buildApp({ db, clock: fixedClock(), assetsDir });
});

afterEach(async () => {
  await app?.close();
  app = undefined;
  db = undefined;
  rmSync(assetsDir, { recursive: true, force: true });
});

async function createSeries(name = '新北廟宇故事'): Promise<string> {
  const response = await currentApp().inject({
    method: 'POST',
    url: '/api/series',
    payload: {
      name,
      visualStyle: '寫實電影感',
      direction: '歷史故事',
      defaultImageModel: 'nano-banana-pro',
      defaultVideoModel: 'gemini-omni-1.1-flash',
    },
  });
  return seriesResponseSchema.parse(response.json()).series.id;
}

async function createVideo(seriesId: string, templeId = TEMPLE_A): Promise<string> {
  const response = await currentApp().inject({ method: 'POST', url: '/api/videos', payload: { seriesId, templeId } });
  return videoResponseSchema.parse(response.json()).video.id;
}

async function postOriginal(videoId: string, payload: Record<string, unknown> = { mime: 'image/png', dataBase64: ORIGINAL_PNG }) {
  return currentApp().inject({ method: 'POST', url: `/api/videos/${videoId}/photos/originals`, payload });
}

async function uploadOriginal(videoId: string): Promise<string> {
  return assetResponseSchema.parse((await postOriginal(videoId)).json()).asset.id;
}

async function postPhoto(videoId: string, payload: Record<string, unknown>) {
  return currentApp().inject({ method: 'POST', url: `/api/videos/${videoId}/photos`, payload });
}

async function uploadPhoto(videoId: string, extra: Record<string, unknown> = {}) {
  const originalAssetId = await uploadOriginal(videoId);
  const response = await postPhoto(videoId, {
    originalAssetId,
    deidentified: { mime: 'image/png', dataBase64: DEID_PNG },
    deidBoxes: [faceBox],
    ...extra,
  });
  return photoResponseSchema.parse(response.json()).photo;
}

async function videoDetail(videoId: string) {
  return videoDetailResponseSchema.parse((await currentApp().inject({ url: `/api/videos/${videoId}` })).json());
}

function assetRow(id: string) {
  const row = currentDb().select().from(assets).where(eq(assets.id, id)).get();
  if (!row) throw new Error(`資料庫沒有這個資產：${id}`);
  return row;
}

describe('上傳原圖 POST /api/videos/:id/photos/originals', () => {
  it('原圖存在 originals/ 底下，標示不能送往雲端', async () => {
    const videoId = await createVideo(await createSeries());

    const response = await postOriginal(videoId);

    expect(response.statusCode).toBe(201);
    const { asset } = assetResponseSchema.parse(response.json());
    expect(asset).toMatchObject({ kind: 'original_photo', mime: 'image/png', cloudOk: false });
    const row = assetRow(asset.id);
    expect(row.cloudOk).toBe(false);
    expect(row.path.startsWith('originals/')).toBe(true);
    expect(readFileSync(path.join(assetsDir, row.path))).toEqual(Buffer.from(ORIGINAL_PNG, 'base64'));
  });

  it('記錄檔案的 sha256', async () => {
    const videoId = await createVideo(await createSeries());

    const { asset } = assetResponseSchema.parse((await postOriginal(videoId)).json());

    expect(asset.sha256).toBe(createHash('sha256').update(Buffer.from(ORIGINAL_PNG, 'base64')).digest('hex'));
  });

  it('格式不支援時回應 400', async () => {
    const videoId = await createVideo(await createSeries());

    const response = await postOriginal(videoId, { mime: 'image/gif', dataBase64: ORIGINAL_PNG });

    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).message).toBe('照片資料不正確');
  });

  it('檔案內容和宣告的格式不符時回應 400', async () => {
    const videoId = await createVideo(await createSeries());

    const response = await postOriginal(videoId, { mime: 'image/jpeg', dataBase64: ORIGINAL_PNG });

    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).message).toBe('照片內容和格式不符');
  });

  it('影片不存在時回應 404', async () => {
    const response = await postOriginal('no-such-video');

    expect(response.statusCode).toBe(404);
    expect(apiErrorSchema.parse(response.json()).message).toBe('找不到這支影片');
  });
});

describe('上傳去識別後的照片 POST /api/videos/:id/photos', () => {
  it('建立照片：去識別圖存在 deid/ 底下、可以送往雲端，與原圖是不同檔案', async () => {
    const videoId = await createVideo(await createSeries());

    const photo = await uploadPhoto(videoId, { viewKey: 'front_overview' });

    expect(photo).toMatchObject({ templeId: TEMPLE_A, videoId: null, viewKey: 'front_overview', deidBoxes: [faceBox] });
    const original = assetRow(photo.originalAssetId);
    const deid = assetRow(photo.deidentifiedAssetId);
    expect(original).toMatchObject({ kind: 'original_photo', cloudOk: false });
    expect(deid).toMatchObject({ kind: 'deid_photo', cloudOk: true });
    expect(deid.path.startsWith('deid/')).toBe(true);
    expect(readFileSync(path.join(assetsDir, deid.path))).toEqual(Buffer.from(DEID_PNG, 'base64'));
  });

  it('回應 201，照片出現在影片的照片列表', async () => {
    const videoId = await createVideo(await createSeries());
    const originalAssetId = await uploadOriginal(videoId);

    const response = await postPhoto(videoId, {
      originalAssetId,
      deidentified: { mime: 'image/png', dataBase64: DEID_PNG },
      deidBoxes: [],
    });

    expect(response.statusCode).toBe(201);
    const detail = await videoDetail(videoId);
    expect(detail.photos.map((photo) => photo.id)).toEqual([photoResponseSchema.parse(response.json()).photo.id]);
    expect(detail.photos[0]?.viewKey).toBeNull();
  });

  it('原圖不存在時回應 404', async () => {
    const videoId = await createVideo(await createSeries());

    const response = await postPhoto(videoId, {
      originalAssetId: 'no-such-asset',
      deidentified: { mime: 'image/png', dataBase64: DEID_PNG },
      deidBoxes: [],
    });

    expect(response.statusCode).toBe(404);
    expect(apiErrorSchema.parse(response.json()).message).toBe('找不到這張照片的原圖');
  });

  it('原圖編號指向去識別後的圖時回應 400', async () => {
    const videoId = await createVideo(await createSeries());
    const first = await uploadPhoto(videoId);

    const response = await postPhoto(videoId, {
      originalAssetId: first.deidentifiedAssetId,
      deidentified: { mime: 'image/png', dataBase64: DEID_PNG },
      deidBoxes: [],
    });

    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).message).toBe('原圖編號指向的不是原圖');
  });

  it('遮蔽框超出照片範圍時回應 400，指出是哪一個框', async () => {
    const videoId = await createVideo(await createSeries());
    const originalAssetId = await uploadOriginal(videoId);

    const response = await postPhoto(videoId, {
      originalAssetId,
      deidentified: { mime: 'image/png', dataBase64: DEID_PNG },
      deidBoxes: [{ ...faceBox, x: 0.9, width: 0.3 }],
    });

    expect(response.statusCode).toBe(400);
    const body = apiErrorSchema.parse(response.json());
    expect(body.message).toBe('照片資料不正確');
    expect(body.fieldErrors?.['deidBoxes.0']).toBe('遮蔽框超出照片範圍');
  });

  it('視角不在標準清單時回應 400', async () => {
    const videoId = await createVideo(await createSeries());
    const originalAssetId = await uploadOriginal(videoId);

    const response = await postPhoto(videoId, {
      originalAssetId,
      deidentified: { mime: 'image/png', dataBase64: DEID_PNG },
      deidBoxes: [],
      viewKey: 'rooftop',
    });

    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).fieldErrors?.viewKey).toBe('請從清單選擇視角');
  });

  it('去識別圖的內容和宣告的格式不符時回應 400', async () => {
    const videoId = await createVideo(await createSeries());
    const originalAssetId = await uploadOriginal(videoId);

    const response = await postPhoto(videoId, {
      originalAssetId,
      deidentified: { mime: 'image/webp', dataBase64: DEID_PNG },
      deidBoxes: [],
    });

    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).message).toBe('照片內容和格式不符');
  });

  it('同系列同一間廟已有 5 張照片時，第 6 張回應 409', async () => {
    const videoId = await createVideo(await createSeries());
    for (let i = 0; i < 5; i += 1) await uploadPhoto(videoId);
    const originalAssetId = await uploadOriginal(videoId);

    const response = await postPhoto(videoId, {
      originalAssetId,
      deidentified: { mime: 'image/png', dataBase64: DEID_PNG },
      deidBoxes: [],
    });

    expect(response.statusCode).toBe(409);
    expect(apiErrorSchema.parse(response.json()).message).toBe('每間廟最多 5 張照片');
    expect((await videoDetail(videoId)).photos).toHaveLength(5);
  });

  it('同系列的另一支影片選同一間廟，看得到同一批照片', async () => {
    const seriesId = await createSeries();
    const first = await createVideo(seriesId);
    const photo = await uploadPhoto(first);

    const second = await createVideo(seriesId);

    expect((await videoDetail(second)).photos.map((p) => p.id)).toEqual([photo.id]);
  });

  it('不同系列、或同系列的另一間廟，看不到這些照片', async () => {
    const seriesId = await createSeries();
    await uploadPhoto(await createVideo(seriesId));

    const otherTemple = await createVideo(seriesId, TEMPLE_B);
    const otherSeries = await createVideo(await createSeries('另一個系列'));

    expect((await videoDetail(otherTemple)).photos).toEqual([]);
    expect((await videoDetail(otherSeries)).photos).toEqual([]);
  });

  it('5 張的上限以系列中的這間廟計算，另一間廟可以再上傳', async () => {
    const seriesId = await createSeries();
    const first = await createVideo(seriesId);
    for (let i = 0; i < 5; i += 1) await uploadPhoto(first);

    const other = await createVideo(seriesId, TEMPLE_B);
    const photo = await uploadPhoto(other);

    expect(photo.templeId).toBe(TEMPLE_B);
  });

  it('照片列表依上傳順序排列', async () => {
    const videoId = await createVideo(await createSeries());
    const a = await uploadPhoto(videoId);
    const b = await uploadPhoto(videoId);

    expect((await videoDetail(videoId)).photos.map((p) => p.id)).toEqual([a.id, b.id]);
  });
});

describe('修改照片 PATCH /api/videos/:id/photos/:photoId', () => {
  async function patchPhoto(videoId: string, photoId: string, payload: Record<string, unknown>) {
    return currentApp().inject({ method: 'PATCH', url: `/api/videos/${videoId}/photos/${photoId}`, payload });
  }

  it('手動指定視角', async () => {
    const videoId = await createVideo(await createSeries());
    const photo = await uploadPhoto(videoId);

    const response = await patchPhoto(videoId, photo.id, { viewKey: 'courtyard' });

    expect(response.statusCode).toBe(200);
    expect(photoResponseSchema.parse(response.json()).photo.viewKey).toBe('courtyard');
    expect((await videoDetail(videoId)).photos[0]?.viewKey).toBe('courtyard');
  });

  it('視角可以改回未指定', async () => {
    const videoId = await createVideo(await createSeries());
    const photo = await uploadPhoto(videoId, { viewKey: 'courtyard' });

    const response = await patchPhoto(videoId, photo.id, { viewKey: null });

    expect(photoResponseSchema.parse(response.json()).photo.viewKey).toBeNull();
  });

  it('視角不在標準清單時回應 400', async () => {
    const videoId = await createVideo(await createSeries());
    const photo = await uploadPhoto(videoId);

    const response = await patchPhoto(videoId, photo.id, { viewKey: 'rooftop' });

    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).fieldErrors?.viewKey).toBe('請從清單選擇視角');
  });

  it('重新遮蔽：換成新的去識別圖與遮蔽框，原圖不變，舊的去識別圖不刪除', async () => {
    const videoId = await createVideo(await createSeries());
    const photo = await uploadPhoto(videoId);
    const oldDeid = assetRow(photo.deidentifiedAssetId);
    const cancelled = { ...faceBox, cancelled: true };

    const response = await patchPhoto(videoId, photo.id, {
      deidentified: { mime: 'image/png', dataBase64: ORIGINAL_PNG },
      deidBoxes: [cancelled],
    });

    expect(response.statusCode).toBe(200);
    const updated = photoResponseSchema.parse(response.json()).photo;
    expect(updated.originalAssetId).toBe(photo.originalAssetId);
    expect(updated.deidentifiedAssetId).not.toBe(photo.deidentifiedAssetId);
    expect(updated.deidBoxes).toEqual([cancelled]);
    expect(assetRow(updated.deidentifiedAssetId)).toMatchObject({ kind: 'deid_photo', cloudOk: true });
    expect(existsSync(path.join(assetsDir, oldDeid.path))).toBe(true);
  });

  it('只送遮蔽框、沒送去識別圖時回應 400', async () => {
    const videoId = await createVideo(await createSeries());
    const photo = await uploadPhoto(videoId);

    const response = await patchPhoto(videoId, photo.id, { deidBoxes: [] });

    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).message).toBe('重新遮蔽時，去識別後的照片與遮蔽框要一起送出');
  });

  it('這支影片看不到的照片回應 404', async () => {
    const seriesId = await createSeries();
    const photo = await uploadPhoto(await createVideo(seriesId));
    const otherTemple = await createVideo(seriesId, TEMPLE_B);

    const response = await patchPhoto(otherTemple, photo.id, { viewKey: 'courtyard' });

    expect(response.statusCode).toBe(404);
    expect(apiErrorSchema.parse(response.json()).message).toBe('找不到這張照片');
  });
});

describe('讀取檔案 GET /api/assets/:id', () => {
  it('回傳檔案內容與格式', async () => {
    const videoId = await createVideo(await createSeries());
    const photo = await uploadPhoto(videoId);

    const response = await currentApp().inject({ url: `/api/assets/${photo.deidentifiedAssetId}` });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/png');
    expect(response.rawPayload).toEqual(Buffer.from(DEID_PNG, 'base64'));
  });

  it('檔案不存在時回應 404', async () => {
    const response = await currentApp().inject({ url: '/api/assets/no-such-asset' });

    expect(response.statusCode).toBe(404);
    expect(apiErrorSchema.parse(response.json()).message).toBe('找不到這個檔案');
  });
});
