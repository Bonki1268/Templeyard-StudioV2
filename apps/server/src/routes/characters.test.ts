import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { apiErrorSchema, characterListResponseSchema, characterResponseSchema } from '@templeyard/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { createCharacterService } from '../characters/service.js';
import { addVideo, createStudioWorld, type StudioWorld } from '../studio/__fixtures__/studio.js';

let world: StudioWorld;
let app: FastifyInstance;
let assetsDir: string;
let grandmaId: string;

beforeEach(async () => {
  world = await createStudioWorld();
  assetsDir = mkdtempSync(path.join(tmpdir(), 'templeyard-characters-'));
  addVideo(world, { id: 'v1' });
  grandmaId =
    createCharacterService({ db: world.db, clock: world.clock, workflows: world.workflows, prompts: world.prompts, generation: null })
      .resolve('v1', [{ name: '阿嬤', description: '七十多歲的在地阿嬤', continuityLocks: ['grey cotton cardigan'] }])
      .get('阿嬤') ?? '';
  app = buildApp({ db: world.db, clock: world.clock, assetsDir, workflows: world.workflows, prompts: world.prompts, generation: null, generationUnavailableMessage: '還沒設定生成服務' });
});

afterEach(async () => {
  await app.close();
  await world.close();
  rmSync(assetsDir, { recursive: true, force: true });
});

describe('角色 API', () => {
  it('GET /api/videos/:id/characters 列出這支影片能用的角色', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/videos/v1/characters' });
    expect(response.statusCode).toBe(200);
    expect(characterListResponseSchema.parse(response.json()).characters.map((c) => c.name)).toEqual(['阿嬤']);
  });

  it('PATCH 修改外觀描述與連續性鎖', async () => {
    const response = await app.inject({ method: 'PATCH', url: `/api/characters/${grandmaId}`, payload: { description: '戴斗笠的阿嬤', continuityLocks: ['straw hat'] } });
    expect(response.statusCode).toBe(200);
    expect(characterResponseSchema.parse(response.json()).character.version).toMatchObject({ description: '戴斗笠的阿嬤', continuityLocks: ['straw hat'] });
  });

  it.each([
    ['PATCH', `/api/characters/ID`, { description: '  ' }, 400, '請填寫角色的外觀描述'],
    ['PATCH', '/api/characters/nope', { description: '阿嬤' }, 404, '找不到這個角色'],
    ['POST', `/api/characters/ID/confirm`, {}, 409, '「阿嬤」的定裝圖還沒產生完成'],
    ['POST', `/api/characters/ID/series`, {}, 409, '請先確認「阿嬤」的定裝圖'],
    ['POST', `/api/characters/ID/generate`, { videoId: 'v1' }, 503, '還沒設定生成服務'],
    ['GET', '/api/videos/nope/characters', undefined, 404, '找不到這支影片'],
  ] as const)('%s %s：%s', async (method, url, payload, status, message) => {
    const response = await app.inject({ method, url: url.replace('ID', grandmaId), ...(payload ? { payload } : {}) });
    expect(response.statusCode).toBe(status);
    expect(apiErrorSchema.parse(response.json()).message).toBe(message);
  });
});
