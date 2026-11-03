import { apiErrorSchema } from '@templeyard/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { createFramesWorld, type FramesWorld } from '../frames/__fixtures__/framesWorld.js';

let t: FramesWorld;
let app: FastifyInstance;

beforeEach(async () => {
  t = await createFramesWorld();
  app = buildApp({ db: t.world.db, clock: t.world.clock, assetsDir: t.world.assetsDir, workflows: t.world.workflows, prompts: t.world.prompts, generation: null, generationUnavailableMessage: '還沒設定生成服務' });
});

afterEach(async () => {
  await app.close();
  await t.close();
});

describe('細修 API', () => {
  it('GET 這一格的細修資料', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/videos/v1/shots/k2' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ shot: { shotKey: 'k2', seq: 2 }, totalSec: 26 });
  });

  it('PATCH 儲存這一格：回應新的方案版本', async () => {
    const response = await app.inject({ method: 'PATCH', url: '/api/videos/v1/shots/k2', payload: { description: '阿嬤站在香爐旁' } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ plan: { version: 2 } });
  });

  it.each([
    ['GET', '/api/videos/v1/shots/nope', undefined, 404, '方案沒有這一格'],
    ['PATCH', '/api/videos/v1/shots/k2', { durationSec: 0 }, 400, '每格至少 1 秒'],
    ['PATCH', '/api/videos/v1/shots/k2', {}, 400, '沒有要修改的欄位'],
    ['POST', '/api/videos/v1/shots/k1/frames/upload', { kind: 'first', mime: 'image/gif', dataBase64: 'x' }, 400, '請上傳 PNG 或 JPEG 圖片'],
    ['POST', '/api/videos/v1/shots/k1/frames/nope/select', {}, 404, '找不到這張精緻圖'],
    ['POST', '/api/videos/v1/shots/k1/frames/nope/edit', { box: { x: 0, y: 0, width: 0.5, height: 0.5 }, instruction: '  ' }, 400, '請說明要怎麼改這一處'],
    ['POST', '/api/videos/v1/shots/k1/frames/nope/edit', { box: { x: 0.8, y: 0, width: 0.5, height: 0.5 }, instruction: '改' }, 400, '圈選範圍要在畫面之內'],
    ['POST', '/api/videos/v1/shots/k4/keyframes/generate', {}, 409, '這一格還沒開啟中間關鍵畫格'],
    ['GET', '/api/videos/v1/shots/nope/chat', undefined, 404, '方案沒有這一格'],
  ] as const)('%s %s：%s', async (method, url, payload, status, message) => {
    const response = await app.inject({ method, url, ...(payload ? { payload } : {}) });
    expect(response.statusCode).toBe(status);
    expect(apiErrorSchema.parse(response.json()).message).toBe(message);
  });
});
