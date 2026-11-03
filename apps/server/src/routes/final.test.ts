import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { apiErrorSchema } from '@templeyard/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { addVideo, createStudioWorld, type StudioWorld } from '../studio/__fixtures__/studio.js';

// 第 12 階段：成品的確認、下載與複製影片 API

let world: StudioWorld;
let app: FastifyInstance;
let assetsDir: string;

beforeEach(async () => {
  world = await createStudioWorld();
  assetsDir = mkdtempSync(path.join(tmpdir(), 'templeyard-final-'));
  addVideo(world, { id: 'v1' });
  app = buildApp({ db: world.db, clock: world.clock, assetsDir, workflows: world.workflows, prompts: world.prompts, generation: null, generationUnavailableMessage: '還沒設定生成服務' });
});

afterEach(async () => {
  await app.close();
  await world.close();
  rmSync(assetsDir, { recursive: true, force: true });
});

describe('成品 API', () => {
  it.each([
    ['GET', '/api/videos/v1/final/download', 404, '還沒有成品'],
    ['GET', '/api/videos/nope/final/download', 404, '找不到這支影片'],
    ['POST', '/api/videos/v1/final/confirm', 409, '還沒有成品'],
    ['POST', '/api/videos/nope/final/confirm', 404, '找不到這支影片'],
    ['POST', '/api/videos/nope/copy', 404, '找不到這支影片'],
  ] as const)('%s %s：%s', async (method, url, status, message) => {
    const response = await app.inject({ method, url });
    expect(response.statusCode).toBe(status);
    expect(apiErrorSchema.parse(response.json()).message).toBe(message);
  });

  it('POST copy：201，回傳新影片（記下複製來源）', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/videos/v1/copy' });
    expect(response.statusCode).toBe(201);
    const { video } = response.json() as { video: { id: string; copiedFromVideoId: string; stage: string } };
    expect(video).toMatchObject({ copiedFromVideoId: 'v1', stage: 'creating' });
    expect(video.id).not.toBe('v1');
  });
});
