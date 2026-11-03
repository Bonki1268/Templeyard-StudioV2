import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { apiErrorSchema, clipsResponseSchema } from '@templeyard/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { addVideo, createStudioWorld, type StudioWorld } from '../studio/__fixtures__/studio.js';

// 第 11 階段：影片與成品 API

let world: StudioWorld;
let app: FastifyInstance;
let assetsDir: string;

beforeEach(async () => {
  world = await createStudioWorld();
  assetsDir = mkdtempSync(path.join(tmpdir(), 'templeyard-clips-'));
  addVideo(world, { id: 'v1' });
  app = buildApp({ db: world.db, clock: world.clock, assetsDir, workflows: world.workflows, prompts: world.prompts, generation: null, generationUnavailableMessage: '還沒設定生成服務' });
});

afterEach(async () => {
  await app.close();
  await world.close();
  rmSync(assetsDir, { recursive: true, force: true });
});

describe('影片 API', () => {
  it('GET 還沒有方案時沒有格子、沒有成品、沒有在生成', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/videos/v1/clips' });
    expect(response.statusCode).toBe(200);
    expect(clipsResponseSchema.parse(response.json())).toEqual({ generating: false, generatingLabel: null, shots: [], final: null, composeError: null });
  });

  it.each([
    ['GET', '/api/videos/nope/clips', undefined, 404, '找不到這支影片'],
    ['POST', '/api/videos/nope/generate/clips', {}, 404, '找不到這支影片'],
    ['POST', '/api/videos/v1/generate/clips', {}, 409, '還沒有分鏡方案'],
    ['POST', '/api/videos/v1/generate/clips', { consentToken: 3 }, 400, '同意憑證格式不正確'],
  ] as const)('%s %s：%s', async (method, url, payload, status, message) => {
    const response = await app.inject({ method, url, ...(payload ? { payload } : {}) });
    expect(response.statusCode).toBe(status);
    expect(apiErrorSchema.parse(response.json()).message).toBe(message);
  });

  it('PATCH 這一格的候選圖張數超出範圍：400', async () => {
    const response = await app.inject({ method: 'PATCH', url: '/api/videos/v1/shots/k1', payload: { candidateCount: 5 } });
    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).message).toBe('候選圖最多 4 張');
  });
});
