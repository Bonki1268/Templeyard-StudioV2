import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { apiErrorSchema, createSseParser, framesResponseSchema } from '@templeyard/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { addVideo, createStudioWorld, type StudioWorld } from '../studio/__fixtures__/studio.js';

let world: StudioWorld;
let app: FastifyInstance;
let assetsDir: string;

beforeEach(async () => {
  world = await createStudioWorld();
  assetsDir = mkdtempSync(path.join(tmpdir(), 'templeyard-frames-'));
  addVideo(world, { id: 'v1' });
  app = buildApp({ db: world.db, clock: world.clock, assetsDir, workflows: world.workflows, prompts: world.prompts, generation: null, generationUnavailableMessage: '還沒設定生成服務' });
});

afterEach(async () => {
  await app.close();
  await world.close();
  rmSync(assetsDir, { recursive: true, force: true });
});

describe('精緻圖 API', () => {
  it('GET 還沒有方案時沒有格子、沒有在生成', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/videos/v1/frames' });
    expect(response.statusCode).toBe(200);
    expect(framesResponseSchema.parse(response.json())).toEqual({ generating: false, generatingLabel: null, shots: [] });
  });

  it.each([
    ['GET', '/api/videos/nope/frames', undefined, 404, '找不到這支影片'],
    ['POST', '/api/videos/v1/generate/frames', {}, 409, '還沒有分鏡方案'],
    ['POST', '/api/videos/v1/shots/nope/frames/confirm', {}, 404, '方案沒有這一格'],
    ['POST', '/api/videos/v1/shots/nope/regenerate', { kind: 'middle' }, 400, '請指定首格或末格'],
  ] as const)('%s %s：%s', async (method, url, payload, status, message) => {
    const response = await app.inject({ method, url, ...(payload ? { payload } : {}) });
    expect(response.statusCode).toBe(status);
    expect(apiErrorSchema.parse(response.json()).message).toBe(message);
  });

  it('GET events：以 SSE 送出目前的生成狀態；沒有在生成時送完就結束', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/videos/v1/events' });
    expect(response.headers['content-type']).toContain('text/event-stream');
    const events = createSseParser().push(response.body);
    expect(events).toEqual([{ event: 'frames', data: JSON.stringify({ type: 'frames', generating: false, generatingLabel: null }) }]);
  });

  it('GET events：影片不存在時 404', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/videos/nope/events' });
    expect(response.statusCode).toBe(404);
  });
});
