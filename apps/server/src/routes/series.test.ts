import type { FastifyInstance } from 'fastify';
import {
  apiErrorSchema,
  seriesListResponseSchema,
  seriesResponseSchema,
  type CreateSeriesInput,
} from '@templeyard/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { openDatabase } from '../db/client.js';
import type { Clock } from '../series/repository.js';

// 固定的時間與 ID：每次呼叫往後一分鐘、ID 依序編號
function fixedClock(): Clock {
  let minutes = 0;
  let id = 0;
  return {
    now: () => new Date(Date.UTC(2026, 10, 2, 9, minutes++)),
    newId: () => `series-${++id}`,
  };
}

const validInput: CreateSeriesInput = {
  name: '新北廟宇故事',
  visualStyle: '寫實電影感、清晨暖光、淺景深',
  durationSec: 30,
  direction: '歷史故事',
  defaultImageModel: 'nano-banana-pro',
  defaultVideoModel: 'gemini-omni-1.1-flash',
};

let app: FastifyInstance | undefined;

function currentApp(): FastifyInstance {
  if (!app) throw new Error('app 沒有建立');
  return app;
}

beforeEach(() => {
  app = buildApp({ db: openDatabase(':memory:'), clock: fixedClock() });
});

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function create(input: Partial<CreateSeriesInput> = {}) {
  return currentApp().inject({ method: 'POST', url: '/api/series', payload: { ...validInput, ...input } });
}

describe('建立系列 POST /api/series', () => {
  it('建立成功回應 201 與新系列，問卷預設值一開始是空的', async () => {
    const response = await create();

    expect(response.statusCode).toBe(201);
    expect(seriesResponseSchema.parse(response.json()).series).toEqual({
      id: 'series-1',
      ...validInput,
      questionnaireDefaults: null,
      createdAt: '2026-11-02T09:00:00.000Z',
      updatedAt: '2026-11-02T09:00:00.000Z',
    });
  });

  it('文字欄位去掉前後空白再存', async () => {
    const response = await create({ name: '  廟會節慶  ', direction: ' 節慶宣傳 ' });

    expect(seriesResponseSchema.parse(response.json()).series).toMatchObject({
      name: '廟會節慶',
      direction: '節慶宣傳',
    });
  });

  it('影片方向可以是自己寫的文字', async () => {
    const response = await create({ direction: '廟口美食' });
    expect(seriesResponseSchema.parse(response.json()).series.direction).toBe('廟口美食');
  });

  it.each([
    [{ name: '' }, 'name', '請填寫系列名稱'],
    [{ name: '   ' }, 'name', '請填寫系列名稱'],
    [{ visualStyle: '' }, 'visualStyle', '請填寫整體視覺風格'],
    [{ durationSec: 31 }, 'durationSec', '影片秒數要在 1～30 秒之間'],
    [{ durationSec: 0 }, 'durationSec', '影片秒數要在 1～30 秒之間'],
    [{ durationSec: 12.5 }, 'durationSec', '影片秒數要在 1～30 秒之間'],
    [{ direction: '' }, 'direction', '請選擇或填寫影片方向'],
    [{ defaultImageModel: 'midjourney' }, 'defaultImageModel', '請從清單選擇圖片模型'],
    [{ defaultVideoModel: 'sora' }, 'defaultVideoModel', '請從清單選擇影片模型'],
  ] as const)('資料不正確 %j 時回應 400，欄位 %s 說明「%s」', async (patch, field, message) => {
    const response = await currentApp().inject({
      method: 'POST',
      url: '/api/series',
      payload: { ...validInput, ...patch },
    });

    expect(response.statusCode).toBe(400);
    const body = apiErrorSchema.parse(response.json());
    expect(body.message).toBe('系列資料不正確');
    expect(body.fieldErrors?.[field]).toBe(message);
  });

  it('缺少欄位時回應 400，指出每個缺少的欄位', async () => {
    const response = await currentApp().inject({ method: 'POST', url: '/api/series', payload: {} });

    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).fieldErrors).toMatchObject({
      name: '請填寫系列名稱',
      visualStyle: '請填寫整體視覺風格',
      direction: '請選擇或填寫影片方向',
    });
  });

  it('資料不正確時不會寫入', async () => {
    await create({ name: '' });

    const list = await currentApp().inject({ method: 'GET', url: '/api/series' });
    expect(seriesListResponseSchema.parse(list.json()).series).toEqual([]);
  });
});

describe('系列列表 GET /api/series', () => {
  it('沒有系列時回應空列表', async () => {
    const response = await currentApp().inject({ method: 'GET', url: '/api/series' });

    expect(response.statusCode).toBe(200);
    expect(seriesListResponseSchema.parse(response.json()).series).toEqual([]);
  });

  it('新建立的系列排在前面', async () => {
    await create({ name: '第一個' });
    await create({ name: '第二個' });

    const response = await currentApp().inject({ method: 'GET', url: '/api/series' });

    expect(seriesListResponseSchema.parse(response.json()).series.map((s) => s.name)).toEqual(['第二個', '第一個']);
  });
});

describe('修改系列 PATCH /api/series/:id', () => {
  it('只改有傳的欄位，更新修改時間，建立時間不變', async () => {
    await create();

    const response = await currentApp().inject({
      method: 'PATCH',
      url: '/api/series/series-1',
      payload: { name: '新北廟宇故事 第二季', durationSec: 20 },
    });

    expect(response.statusCode).toBe(200);
    expect(seriesResponseSchema.parse(response.json()).series).toMatchObject({
      id: 'series-1',
      name: '新北廟宇故事 第二季',
      durationSec: 20,
      visualStyle: validInput.visualStyle,
      direction: validInput.direction,
      createdAt: '2026-11-02T09:00:00.000Z',
      updatedAt: '2026-11-02T09:01:00.000Z',
    });
  });

  it('修改後列表顯示新的內容', async () => {
    await create();
    await currentApp().inject({ method: 'PATCH', url: '/api/series/series-1', payload: { direction: '景點導覽' } });

    const list = await currentApp().inject({ method: 'GET', url: '/api/series' });

    expect(seriesListResponseSchema.parse(list.json()).series[0]?.direction).toBe('景點導覽');
  });

  it('系列不存在時回應 404', async () => {
    const response = await currentApp().inject({
      method: 'PATCH',
      url: '/api/series/no-such-series',
      payload: { name: '改名' },
    });

    expect(response.statusCode).toBe(404);
    expect(apiErrorSchema.parse(response.json()).message).toBe('找不到這個系列');
  });

  it('資料不正確時回應 400', async () => {
    await create();

    const response = await currentApp().inject({
      method: 'PATCH',
      url: '/api/series/series-1',
      payload: { durationSec: 45 },
    });

    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).fieldErrors?.durationSec).toBe('影片秒數要在 1～30 秒之間');
  });

  it('沒有要修改的欄位時回應 400', async () => {
    await create();

    const response = await currentApp().inject({ method: 'PATCH', url: '/api/series/series-1', payload: {} });

    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).message).toBe('沒有要修改的欄位');
  });
});
