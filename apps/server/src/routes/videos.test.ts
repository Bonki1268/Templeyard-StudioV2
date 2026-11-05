import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import {
  apiErrorSchema,
  seriesResponseSchema,
  videoDetailResponseSchema,
  videoResponseSchema,
  type CreateSeriesInput,
} from '@templeyard/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { openDatabase } from '../db/client.js';
import type { Clock } from '../series/repository.js';
import { importTemples } from '../temples/import.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const sampleCsv = readFileSync(path.join(here, '..', 'temples', '__fixtures__', 'temples-sample.csv'), 'utf8');

// 測試資料裡的兩間廟
const TEMPLE_A = 'A0000000-0000-0000-0000-000000000001'; // 臺北鎮北宮
const TEMPLE_B = 'A0000000-0000-0000-0000-000000000002'; // 台北石靈宮

function fixedClock(): Clock {
  let minutes = 0;
  let id = 0;
  return {
    now: () => new Date(Date.UTC(2026, 10, 2, 9, minutes++)),
    newId: () => `id-${++id}`,
  };
}

const seriesInput: CreateSeriesInput = {
  name: '新北廟宇故事',
  visualStyle: '寫實電影感',
  direction: '歷史故事',
  defaultImageModel: 'nano-banana-pro',
  defaultVideoModel: 'seedance-2.0',
};

let app: FastifyInstance | undefined;

function currentApp(): FastifyInstance {
  if (!app) throw new Error('app 沒有建立');
  return app;
}

beforeEach(() => {
  const db = openDatabase(':memory:');
  importTemples(db, sampleCsv);
  app = buildApp({ db, clock: fixedClock() });
});

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function createSeries(input: Partial<CreateSeriesInput> = {}): Promise<string> {
  const response = await currentApp().inject({ method: 'POST', url: '/api/series', payload: { ...seriesInput, ...input } });
  return seriesResponseSchema.parse(response.json()).series.id;
}

async function postVideo(payload: Record<string, unknown>) {
  return currentApp().inject({ method: 'POST', url: '/api/videos', payload });
}

async function createVideo(seriesId: string, templeId = TEMPLE_A): Promise<string> {
  const response = await postVideo({ seriesId, templeId });
  return videoResponseSchema.parse(response.json()).video.id;
}

async function patchVideo(id: string, payload: Record<string, unknown>) {
  return currentApp().inject({ method: 'PATCH', url: `/api/videos/${id}`, payload });
}

describe('建立影片 POST /api/videos', () => {
  it('建立影片草稿：帶入系列的預設模型，階段是 creating，模型還沒鎖定', async () => {
    const seriesId = await createSeries();

    const response = await postVideo({ seriesId, templeId: TEMPLE_A });

    expect(response.statusCode).toBe(201);
    expect(videoResponseSchema.parse(response.json()).video).toEqual({
      id: expect.any(String),
      seriesId,
      templeId: TEMPLE_A,
      stage: 'creating',
      imageModel: 'nano-banana-pro',
      videoModel: 'seedance-2.0',
      modelsLockedAt: null,
      templeBoardVersionId: null,
      userTempleNotes: '',
      creativeInput: null,
      costLimit: null,
      copiedFromVideoId: null,
      seriesSnapshot: expect.any(Object),
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it('系列不存在時回應 404', async () => {
    const response = await postVideo({ seriesId: 'no-such-series', templeId: TEMPLE_A });

    expect(response.statusCode).toBe(404);
    expect(apiErrorSchema.parse(response.json()).message).toBe('找不到這個系列');
  });

  it('寺廟不存在時回應 404', async () => {
    const seriesId = await createSeries();

    const response = await postVideo({ seriesId, templeId: 'no-such-temple' });

    expect(response.statusCode).toBe(404);
    expect(apiErrorSchema.parse(response.json()).message).toBe('找不到這間寺廟');
  });

  it('沒有選寺廟時回應 400 與欄位說明', async () => {
    const seriesId = await createSeries();

    const response = await postVideo({ seriesId });

    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).fieldErrors?.templeId).toBe('請選擇寺廟');
  });
});

describe('讀取影片 GET /api/videos/:id', () => {
  it('回傳影片、寺廟資料卡與照片列表', async () => {
    const seriesId = await createSeries();
    const videoId = await createVideo(seriesId);

    const response = await currentApp().inject({ method: 'GET', url: `/api/videos/${videoId}` });

    expect(response.statusCode).toBe(200);
    const body = videoDetailResponseSchema.parse(response.json());
    expect(body.video.id).toBe(videoId);
    expect(body.temple).toMatchObject({
      id: TEMPLE_A,
      name: '臺北鎮北宮',
      address: '新北市板橋區文化路1號',
      deity: '玄天上帝',
      religion: '道教',
      foundedYear: 1969,
    });
    expect(body.photos).toEqual([]);
  });

  it('影片不存在時回應 404', async () => {
    const response = await currentApp().inject({ method: 'GET', url: '/api/videos/no-such-video' });

    expect(response.statusCode).toBe(404);
    expect(apiErrorSchema.parse(response.json()).message).toBe('找不到這支影片');
  });
});

describe('修改影片 PATCH /api/videos/:id', () => {
  it('改選模型與寺廟歷史，只改有傳的欄位', async () => {
    const videoId = await createVideo(await createSeries());

    const response = await patchVideo(videoId, { videoModel: 'wan-2.2', userTempleNotes: '清代建廟' });

    expect(response.statusCode).toBe(200);
    expect(videoResponseSchema.parse(response.json()).video).toMatchObject({
      imageModel: 'nano-banana-pro',
      videoModel: 'wan-2.2',
      userTempleNotes: '清代建廟',
    });
  });

  it('修改後 updatedAt 更新，createdAt 不變', async () => {
    const videoId = await createVideo(await createSeries());
    const before = videoDetailResponseSchema.parse((await currentApp().inject({ url: `/api/videos/${videoId}` })).json()).video;

    const after = videoResponseSchema.parse((await patchVideo(videoId, { videoModel: 'wan-2.2' })).json()).video;

    expect(after.createdAt).toBe(before.createdAt);
    expect(after.updatedAt > before.updatedAt).toBe(true);
  });

  it('可以重新選擇另一間寺廟', async () => {
    const videoId = await createVideo(await createSeries());

    await patchVideo(videoId, { templeId: TEMPLE_B });
    const detail = videoDetailResponseSchema.parse((await currentApp().inject({ url: `/api/videos/${videoId}` })).json());

    expect(detail.temple.name).toBe('台北石靈宮');
  });

  it('重新選擇的寺廟不存在時回應 404，影片不變', async () => {
    const videoId = await createVideo(await createSeries());

    const response = await patchVideo(videoId, { templeId: 'no-such-temple' });
    const detail = videoDetailResponseSchema.parse((await currentApp().inject({ url: `/api/videos/${videoId}` })).json());

    expect(response.statusCode).toBe(404);
    expect(apiErrorSchema.parse(response.json()).message).toBe('找不到這間寺廟');
    expect(detail.temple.id).toBe(TEMPLE_A);
  });

  it.each([
    ['imageModel', { imageModel: 'not-a-model' }, '請從清單選擇圖片模型'],
    ['videoModel', { videoModel: 'not-a-model' }, '請從清單選擇影片模型'],
    ['userTempleNotes', { userTempleNotes: '廟'.repeat(5001) }, '寺廟歷史與簡介最多 5000 字'],
    ['costLimit', { costLimit: -1 }, '費用上限要是 0 以上的整數點數'],
    ['costLimit', { costLimit: 1.5 }, '費用上限要是 0 以上的整數點數'],
  ])('%s 不正確時回應 400 與欄位說明', async (field, payload, message) => {
    const videoId = await createVideo(await createSeries());

    const response = await patchVideo(videoId, payload);

    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).fieldErrors?.[field]).toBe(message);
  });

  it('設定與取消本支影片的費用上限', async () => {
    const videoId = await createVideo(await createSeries());

    const set = videoResponseSchema.parse((await patchVideo(videoId, { costLimit: 3000 })).json()).video;
    const cleared = videoResponseSchema.parse((await patchVideo(videoId, { costLimit: null })).json()).video;

    expect(set.costLimit).toBe(3000);
    expect(cleared.costLimit).toBeNull();
  });

  it('寺廟歷史剛好 5000 字可以儲存', async () => {
    const videoId = await createVideo(await createSeries());

    const response = await patchVideo(videoId, { userTempleNotes: '廟'.repeat(5000) });

    expect(response.statusCode).toBe(200);
  });

  it('沒有要修改的欄位時回應 400', async () => {
    const videoId = await createVideo(await createSeries());

    const response = await patchVideo(videoId, {});

    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).message).toBe('沒有要修改的欄位');
  });

  it('影片不存在時回應 404', async () => {
    const response = await patchVideo('no-such-video', { videoModel: 'wan-2.2' });

    expect(response.statusCode).toBe(404);
    expect(apiErrorSchema.parse(response.json()).message).toBe('找不到這支影片');
  });
});

describe('修改系列只影響之後新增的影片（F1）', () => {
  it('改了系列的預設模型，已建立的影片模型不變，新影片用新的預設', async () => {
    const seriesId = await createSeries({ defaultVideoModel: 'gemini-omni-1.1-flash' });
    const firstId = await createVideo(seriesId);

    await currentApp().inject({ method: 'PATCH', url: `/api/series/${seriesId}`, payload: { defaultVideoModel: 'seedance-2.0' } });
    const first = videoDetailResponseSchema.parse((await currentApp().inject({ url: `/api/videos/${firstId}` })).json()).video;
    const second = videoResponseSchema.parse((await postVideo({ seriesId, templeId: TEMPLE_A })).json()).video;

    expect(first.videoModel).toBe('gemini-omni-1.1-flash');
    expect(second.videoModel).toBe('seedance-2.0');
  });
});
