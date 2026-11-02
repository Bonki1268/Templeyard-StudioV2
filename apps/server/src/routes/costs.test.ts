import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { apiErrorSchema, seriesResponseSchema, videoResponseSchema } from '@templeyard/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { openDatabase } from '../db/client.js';
import { importTemples } from '../temples/import.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const sampleCsv = readFileSync(path.join(here, '..', 'temples', '__fixtures__', 'temples-sample.csv'), 'utf8');

let app: FastifyInstance | undefined;

function currentApp(): FastifyInstance {
  if (!app) throw new Error('app 沒有建立');
  return app;
}

beforeEach(() => {
  const db = openDatabase(':memory:');
  importTemples(db, sampleCsv);
  app = buildApp({ db });
});

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function createVideo(): Promise<string> {
  const seriesResponse = await currentApp().inject({
    method: 'POST',
    url: '/api/series',
    payload: {
      name: '系列',
      visualStyle: '寫實',
      durationSec: 30,
      direction: '歷史故事',
      defaultImageModel: 'nano-banana-pro',
      defaultVideoModel: 'gemini-omni-1.1-flash',
    },
  });
  const seriesId = seriesResponseSchema.parse(seriesResponse.json()).series.id;
  const video = await currentApp().inject({
    method: 'POST',
    url: '/api/videos',
    payload: { seriesId, templeId: 'A0000000-0000-0000-0000-000000000001' },
  });
  return videoResponseSchema.parse(video.json()).video.id;
}

const setThreshold = (value: number | null) =>
  currentApp().inject({ method: 'PATCH', url: '/api/settings', payload: { consentThresholdCredits: value } });

const estimate = (videoId: string, items: unknown) =>
  currentApp().inject({ method: 'POST', url: `/api/videos/${videoId}/cost-estimate`, payload: { items } });

const gemini4 = [{ model: 'gemini-omni-1.1-flash', units: 4 }];

describe('系統設定 /api/settings', () => {
  it('一開始沒有單筆同意門檻', async () => {
    const response = await currentApp().inject({ url: '/api/settings' });
    expect(response.json()).toEqual({ settings: { consentThresholdCredits: null } });
  });

  it('設定單筆同意門檻', async () => {
    const response = await setThreshold(150);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ settings: { consentThresholdCredits: 150 } });
    expect((await currentApp().inject({ url: '/api/settings' })).json()).toEqual({ settings: { consentThresholdCredits: 150 } });
  });

  it.each([-1, 1.5, '100'])('門檻是 %j 時回應 400', async (value) => {
    const response = await currentApp().inject({ method: 'PATCH', url: '/api/settings', payload: { consentThresholdCredits: value } });
    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).fieldErrors?.consentThresholdCredits).toBe('同意門檻要是 0 以上的整數點數');
  });
});

describe('預估費用 POST /api/videos/:id/cost-estimate', () => {
  it('門檻內：回傳預估、目前的花費，不需要再次同意', async () => {
    await setThreshold(200);
    const videoId = await createVideo();

    const response = await estimate(videoId, gemini4);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      estimate: { credits: 124, lines: [{ model: 'gemini-omni-1.1-flash', units: 4, unitCredits: 31, credits: 124 }] },
      budget: { spent: 0, reserved: 0, limit: null, threshold: 200 },
      consent: { required: false, reasons: [] },
      message: '',
    });
  });

  it('超過單筆門檻：需要同意，說明原因', async () => {
    await setThreshold(100);
    const videoId = await createVideo();

    const body = (await estimate(videoId, gemini4)).json();

    expect(body.consent).toEqual({
      required: true,
      reasons: [{ code: 'over_threshold', message: '這次預估 124 點，超過單筆同意門檻 100 點' }],
    });
    expect(body.message).toBe('需要同意：這次生成要你再按一次同意才會送出');
  });

  it('超過本支影片的上限：需要同意', async () => {
    await setThreshold(500);
    const videoId = await createVideo();
    await currentApp().inject({ method: 'PATCH', url: `/api/videos/${videoId}`, payload: { costLimit: 100 } });

    const body = (await estimate(videoId, gemini4)).json();

    expect(body.budget.limit).toBe(100);
    expect(body.consent.reasons.map((r: { code: string }) => r.code)).toEqual(['over_limit']);
  });

  it('模型不在設定檔時回應 400，指出是第幾項', async () => {
    const videoId = await createVideo();

    const response = await estimate(videoId, [...gemini4, { model: 'no-such', units: 1 }]);

    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).fieldErrors?.['items.1.model']).toBe('沒有這個模型的呼叫設定');
  });

  it('數量不是正數時回應 400', async () => {
    const videoId = await createVideo();

    const response = await estimate(videoId, [{ model: 'gemini-omni-1.1-flash', units: 0 }]);

    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).fieldErrors?.['items.0.units']).toBe('數量要是正數');
  });

  it('影片不存在時回應 404', async () => {
    const response = await estimate('no-such-video', gemini4);

    expect(response.statusCode).toBe(404);
    expect(apiErrorSchema.parse(response.json()).message).toBe('找不到這支影片');
  });
});

describe('同意 POST /api/videos/:id/consents', () => {
  it('發出同意憑證，附上這次的預估', async () => {
    const videoId = await createVideo();

    const response = await currentApp().inject({ method: 'POST', url: `/api/videos/${videoId}/consents`, payload: { items: gemini4 } });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      consentToken: expect.any(String),
      expiresAt: expect.any(String),
      estimate: { credits: 124, lines: [{ model: 'gemini-omni-1.1-flash', units: 4, unitCredits: 31, credits: 124 }] },
    });
  });

  it('影片不存在時回應 404', async () => {
    const response = await currentApp().inject({ method: 'POST', url: '/api/videos/nope/consents', payload: { items: gemini4 } });
    expect(response.statusCode).toBe(404);
    expect(apiErrorSchema.parse(response.json()).message).toBe('找不到這支影片');
  });
});

describe('這支影片的費用 GET /api/videos/:id/cost', () => {
  it('已用、預留、上限與門檻', async () => {
    await setThreshold(300);
    const videoId = await createVideo();
    await currentApp().inject({ method: 'PATCH', url: `/api/videos/${videoId}`, payload: { costLimit: 3000 } });

    const response = await currentApp().inject({ url: `/api/videos/${videoId}/cost` });

    expect(response.json()).toEqual({ budget: { spent: 0, reserved: 0, limit: 3000, threshold: 300 } });
  });
});
