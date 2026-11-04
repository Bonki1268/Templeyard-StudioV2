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

// 使用者 2026-11-05 提出：系列設定的角色庫
describe('系列角色庫 API', () => {
  it('POST /api/series/:id/characters 新增系列角色：屬於系列、不屬於任何影片', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/series/s1/characters`,
      payload: { name: '阿公', description: '戴斗笠、白鬍子', continuityLocks: ['straw hat'] },
    });
    expect(response.statusCode).toBe(201);
    expect(characterResponseSchema.parse(response.json()).character).toMatchObject({
      name: '阿公',
      isSeries: true,
      seriesId: 's1',
      videoId: null,
      state: 'draft',
      version: { version: 1, description: '戴斗笠、白鬍子', continuityLocks: ['straw hat'], imageModel: 'nano-banana-pro' },
    });
  });

  it('GET /api/series/:id/characters 只列出系列角色，不含影片專屬角色', async () => {
    await app.inject({ method: 'POST', url: `/api/series/s1/characters`, payload: { name: '阿公', description: '戴斗笠' } });
    const response = await app.inject({ method: 'GET', url: `/api/series/s1/characters` });
    expect(response.statusCode).toBe(200);
    expect(characterListResponseSchema.parse(response.json()).characters.map((c) => c.name)).toEqual(['阿公']);
  });

  it('角色庫建立的角色出現在同系列影片能用的角色裡', async () => {
    await app.inject({ method: 'POST', url: `/api/series/s1/characters`, payload: { name: '阿公', description: '戴斗笠' } });
    const response = await app.inject({ method: 'GET', url: '/api/videos/v1/characters' });
    expect(characterListResponseSchema.parse(response.json()).characters.map((c) => c.name)).toEqual(['阿嬤', '阿公']);
  });

  it.each([
    ['角色名稱是空白', 'SERIES', { name: ' ', description: '戴斗笠' }, 400, '請填寫角色名稱'],
    ['外觀描述是空白', 'SERIES', { name: '阿公', description: '' }, 400, '請填寫角色的外觀描述'],
    ['系列不存在', 'nope', { name: '阿公', description: '戴斗笠' }, 404, '找不到這個系列'],
  ] as const)('新增系列角色，%s', async (_name, seriesId, payload, status, message) => {
    const response = await app.inject({ method: 'POST', url: `/api/series/${seriesId.replace('SERIES', 's1')}/characters`, payload });
    expect(response.statusCode).toBe(status);
    expect(apiErrorSchema.parse(response.json()).message).toBe(message);
  });

  it('同系列已經有同名的系列角色：409', async () => {
    await app.inject({ method: 'POST', url: `/api/series/s1/characters`, payload: { name: '阿公', description: '戴斗笠' } });
    const response = await app.inject({ method: 'POST', url: `/api/series/s1/characters`, payload: { name: '阿公', description: '白鬍子' } });
    expect(response.statusCode).toBe(409);
    expect(apiErrorSchema.parse(response.json()).message).toBe('這個系列已經有角色「阿公」');
  });

  it('GET /api/series/:id/characters 系列不存在：404', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/series/nope/characters' });
    expect(response.statusCode).toBe(404);
    expect(apiErrorSchema.parse(response.json()).message).toBe('找不到這個系列');
  });

  it('沒有指定影片時，影片專屬角色不能產生定裝圖：400', async () => {
    const response = await app.inject({ method: 'POST', url: `/api/characters/${grandmaId}/generate`, payload: {} });
    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).message).toBe('請指定是哪一支影片');
  });

  it('沒有指定影片時，系列角色可以送出產生（這裡沒有設定生成服務：503）', async () => {
    const created = await app.inject({ method: 'POST', url: `/api/series/s1/characters`, payload: { name: '阿公', description: '戴斗笠' } });
    const id = characterResponseSchema.parse(created.json()).character.id;
    const response = await app.inject({ method: 'POST', url: `/api/characters/${id}/generate`, payload: {} });
    expect(response.statusCode).toBe(503);
    expect(apiErrorSchema.parse(response.json()).message).toBe('還沒設定生成服務');
  });
});
