import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { healthResponseSchema, templeSearchResponseSchema } from '@templeyard/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { openDatabase } from './db/client.js';
import { importTemples } from './temples/import.js';

const sample = readFileSync(new URL('./temples/__fixtures__/temples-sample.csv', import.meta.url), 'utf8');

// 每個測試各自建立 app 與記憶體資料庫，互不影響
let app: FastifyInstance | undefined;

beforeEach(() => {
  app = undefined;
  const db = openDatabase(':memory:');
  importTemples(db, sample);
  app = buildApp({ db });
});

afterEach(async () => {
  await app?.close();
  app = undefined;
});

function currentApp(): FastifyInstance {
  if (!app) throw new Error('app 沒有建立');
  return app;
}

describe('健康檢查 GET /api/health', () => {
  it('後端正常時回應 200 與狀態 ok', async () => {
    const response = await currentApp().inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(healthResponseSchema.parse(response.json())).toEqual({ status: 'ok' });
  });
});

describe('寺廟搜尋 GET /api/temples', () => {
  it('依關鍵字回傳符合 schema 的結果', async () => {
    const response = await currentApp().inject({
      method: 'GET',
      url: `/api/temples?q=${encodeURIComponent('福龍宮')}`,
    });

    expect(response.statusCode).toBe(200);
    const body = templeSearchResponseSchema.parse(response.json());
    expect(body.temples.map((t) => t.district).sort()).toEqual(['汐止區', '瑞芳區']);
  });

  it('預設排除已廢止，includeInactive=true 時包含', async () => {
    const q = encodeURIComponent('萬壽宮');
    const byDefault = await currentApp().inject({ method: 'GET', url: `/api/temples?q=${q}` });
    const withInactive = await currentApp().inject({ method: 'GET', url: `/api/temples?q=${q}&includeInactive=true` });

    expect(templeSearchResponseSchema.parse(byDefault.json()).temples).toEqual([]);
    expect(templeSearchResponseSchema.parse(withInactive.json()).temples.map((t) => t.name)).toEqual([
      '萬壽宮(已廢止)',
    ]);
  });

  it.each([
    ['limit=0', '筆數小於 1'],
    ['limit=101', '筆數超過 100'],
    ['includeInactive=yes', '不是 true／false'],
  ])('查詢參數「%s」不正確時回應 400 與中文說明（%s）', async (query) => {
    const response = await currentApp().inject({ method: 'GET', url: `/api/temples?${query}` });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ message: expect.stringContaining('查詢參數不正確') });
  });
});
