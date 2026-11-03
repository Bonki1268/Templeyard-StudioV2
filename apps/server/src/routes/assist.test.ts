import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { apiErrorSchema, assistResponseSchema } from '@templeyard/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { addVideo, createStudioWorld, type StudioWorld } from '../studio/__fixtures__/studio.js';

let world: StudioWorld;
let app: FastifyInstance;
let assetsDir: string;

const postAssist = (payload: unknown) => app.inject({ method: 'POST', url: '/api/assist', payload: payload as Record<string, unknown> });

beforeEach(async () => {
  world = await createStudioWorld();
  assetsDir = mkdtempSync(path.join(tmpdir(), 'templeyard-assist-'));
  addVideo(world, { id: 'v1' });
  app = buildApp({
    db: world.db,
    clock: world.clock,
    assetsDir,
    workflows: world.workflows,
    prompts: world.prompts,
    text: { agent: world.model, assist: world.model },
  });
});

afterEach(async () => {
  await app.close();
  await world.close();
  rmSync(assetsDir, { recursive: true, force: true });
});

describe('POST /api/assist', () => {
  it('回應 AI 建議的紀錄（未採用）', async () => {
    const response = await postAssist({ field: 'creative.input', videoId: 'v1', userInput: '媽祖救漁民' });

    expect(response.statusCode).toBe(200);
    const { log } = assistResponseSchema.parse(response.json());
    expect(log).toMatchObject({ field: 'creative.input', videoId: 'v1', seriesId: 's1', userInput: '媽祖救漁民', adopted: false });
    expect(log.suggestion.length).toBeGreaterThan(0);
  });

  it.each([
    ['欄位不在清單', { field: 'plan.shot', videoId: 'v1' }, 400, '這個欄位不能使用 AI 幫我寫'],
    ['沒有欄位', { videoId: 'v1' }, 400, '這個欄位不能使用 AI 幫我寫'],
    ['影片欄位沒有指定影片', { field: 'creative.input' }, 400, '這個欄位要指定影片'],
    ['內容超過 2000 字', { field: 'creative.input', videoId: 'v1', userInput: '字'.repeat(2001) }, 400, '內容最多 2000 字'],
    ['影片不存在', { field: 'creative.input', videoId: 'nope' }, 404, '找不到這支影片'],
    ['系列不存在', { field: 'series.visualStyle', seriesId: 'nope' }, 404, '找不到這個系列'],
  ])('%s：%s', async (_label, payload, status, message) => {
    const response = await postAssist(payload);
    expect(response.statusCode).toBe(status);
    expect(apiErrorSchema.parse(response.json()).message).toBe(message);
  });

  it('Claude 回的格式不正確：502', async () => {
    const response = await postAssist({ field: 'creative.input', videoId: 'v1', userInput: '測試：AI 建議格式錯誤' });
    expect(response.statusCode).toBe(502);
    expect(apiErrorSchema.parse(response.json()).message).toBe('AI 建議的格式不正確，請再試一次');
  });

  it('沒有設定 Claude：503', async () => {
    await app.close();
    app = buildApp({ db: world.db, clock: world.clock, assetsDir, workflows: world.workflows, prompts: world.prompts, text: null, textUnavailableMessage: '還沒設定 Claude' });
    const response = await postAssist({ field: 'creative.input', videoId: 'v1' });
    expect(response.statusCode).toBe(503);
    expect(apiErrorSchema.parse(response.json()).message).toBe('還沒設定 Claude');
  });
});

describe('採用', () => {
  it('GET 看得到紀錄；POST adopt 後標示已採用', async () => {
    const { log } = assistResponseSchema.parse((await postAssist({ field: 'creative.input', videoId: 'v1' })).json());

    const before = assistResponseSchema.parse((await app.inject({ method: 'GET', url: `/api/assist/${log.id}` })).json());
    expect(before.log.adopted).toBe(false);

    const adopted = await app.inject({ method: 'POST', url: `/api/assist/${log.id}/adopt` });
    expect(adopted.statusCode).toBe(200);
    expect(assistResponseSchema.parse(adopted.json()).log.adopted).toBe(true);

    const after = assistResponseSchema.parse((await app.inject({ method: 'GET', url: `/api/assist/${log.id}` })).json());
    expect(after.log.adopted).toBe(true);
  });

  it('找不到這筆建議：404', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/assist/nope/adopt' });
    expect(response.statusCode).toBe(404);
    expect(apiErrorSchema.parse(response.json()).message).toBe('找不到這筆 AI 建議');
  });
});
