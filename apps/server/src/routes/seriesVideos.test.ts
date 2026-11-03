import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { apiErrorSchema, seriesVideosResponseSchema } from '@templeyard/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { addVideo, createStudioWorld, type StudioWorld } from '../studio/__fixtures__/studio.js';

// 系列設定：這個系列的影片（使用者 2026-11-04 提出）

let world: StudioWorld;
let app: FastifyInstance;
let assetsDir: string;

beforeEach(async () => {
  world = await createStudioWorld();
  assetsDir = mkdtempSync(path.join(tmpdir(), 'templeyard-series-videos-'));
  app = buildApp({ db: world.db, clock: world.clock, assetsDir, workflows: world.workflows, prompts: world.prompts, generation: null, generationUnavailableMessage: '還沒設定生成服務' });
});

afterEach(async () => {
  await app.close();
  await world.close();
  rmSync(assetsDir, { recursive: true, force: true });
});

describe('GET /api/series/:id/videos', () => {
  it('列出這個系列的影片：寺廟名稱、階段、更新時間；還沒有圖時沒有縮圖', async () => {
    addVideo(world, { id: 'v1', stage: 'final' });
    addVideo(world, { id: 'v2', stage: 'creating' });
    const response = await app.inject({ method: 'GET', url: '/api/series/s1/videos' });
    expect(response.statusCode).toBe(200);
    const body = seriesVideosResponseSchema.parse(response.json());
    expect(body.videos.map((v) => [v.id, v.templeName, v.stage, v.thumbnailAssetId]).sort()).toEqual([
      ['v1', '板橋慈惠宮', 'final', null],
      ['v2', '板橋慈惠宮', 'creating', null],
    ]);
    expect(body.characters).toEqual([]);
  });

  it('沒有影片的系列：空的', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/series/s1/videos' });
    expect(seriesVideosResponseSchema.parse(response.json())).toEqual({ videos: [], characters: [] });
  });

  it('系列不存在：404', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/series/nope/videos' });
    expect(response.statusCode).toBe(404);
    expect(apiErrorSchema.parse(response.json()).message).toBe('找不到這個系列');
  });
});
