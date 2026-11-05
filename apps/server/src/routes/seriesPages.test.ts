import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { apiErrorSchema } from '@templeyard/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { createCharacterService } from '../characters/service.js';
import { questionnaires, series, videos } from '../db/schema.js';
import { addVideo, createStudioWorld, type StudioWorld } from '../studio/__fixtures__/studio.js';

// 第 14 階段：系列頁的 API（過去的影片、問卷預設值、角色庫查詢、角色版本與用到的影片、影片建立時保存的系列設定）

let world: StudioWorld;
let app: FastifyInstance;
let assetsDir: string;

type Card = {
  id: string;
  title: string;
  district: string;
  statusLabel: string;
  group: 'wip' | 'done';
  imageModel: string;
  videoModel: string;
  isDefaultsSource: boolean;
  finalDurationSec: number | null;
};

beforeEach(async () => {
  world = await createStudioWorld();
  assetsDir = mkdtempSync(path.join(tmpdir(), 'templeyard-series-pages-'));
  app = buildApp({ db: world.db, clock: world.clock, assetsDir, workflows: world.workflows, prompts: world.prompts, generation: null, generationUnavailableMessage: '還沒設定生成服務' });
});

afterEach(async () => {
  await app.close();
  await world.close();
  rmSync(assetsDir, { recursive: true, force: true });
});

function submitQuestionnaire(videoId: string, submittedAt: string) {
  world.db.insert(questionnaires).values({ id: `q-${videoId}`, videoId, answers: [], submittedAt }).run();
}

async function cards(query = ''): Promise<Card[]> {
  const response = await app.inject({ method: 'GET', url: `/api/series/s1/videos${query}` });
  expect(response.statusCode).toBe(200);
  return (response.json() as { videos: Card[] }).videos;
}

describe('GET /api/series/:id/videos 過去的影片', () => {
  it('每支影片帶標題、行政區、鎖定的模型、狀態細節與分組', async () => {
    addVideo(world, { id: 'v1', stage: 'board_pending', creativeInput: '講媽祖顯靈救漁民的故事' });
    addVideo(world, { id: 'v2', stage: 'done', templeId: 't2' });
    const found = Object.fromEntries((await cards()).map((card) => [card.id, card]));
    expect(found.v1).toMatchObject({
      title: '板橋慈惠宮：講媽祖顯靈救漁民的故事',
      district: '板橋區',
      statusLabel: '寺廟定裝版待確認',
      group: 'wip',
      imageModel: 'nano-banana-pro',
      videoModel: 'gemini-omni-1.1-flash',
      finalDurationSec: null,
    });
    expect(found.v2).toMatchObject({ title: '新莊地藏庵', district: '新莊區', statusLabel: '完成', group: 'done' });
  });

  it('依狀態篩選', async () => {
    addVideo(world, { id: 'v1', stage: 'plan' });
    addVideo(world, { id: 'v2', stage: 'done' });
    expect((await cards('?status=wip')).map((c) => c.id)).toEqual(['v1']);
    expect((await cards('?status=done')).map((c) => c.id)).toEqual(['v2']);
    expect((await cards('?status=all')).map((c) => c.id).sort()).toEqual(['v1', 'v2']);
  });

  it('依寺廟名稱排序（依字元順序）', async () => {
    addVideo(world, { id: 'v1', templeId: 't1' });
    addVideo(world, { id: 'v2', templeId: 't2' });
    expect((await cards('?sort=temple')).map((c) => c.title)).toEqual(['板橋慈惠宮', '新莊地藏庵'].sort());
  });

  it('最近更新與建立時間：新的在前', async () => {
    addVideo(world, { id: 'v1' });
    addVideo(world, { id: 'v2' });
    world.db.update(videos).set({ createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-04T00:00:00Z' }).where(eq(videos.id, 'v1')).run();
    world.db.update(videos).set({ createdAt: '2026-11-02T00:00:00Z', updatedAt: '2026-11-03T00:00:00Z' }).where(eq(videos.id, 'v2')).run();
    expect((await cards('?sort=updated')).map((c) => c.id)).toEqual(['v1', 'v2']);
    expect((await cards('?sort=created')).map((c) => c.id)).toEqual(['v2', 'v1']);
  });

  it('系列第一支送出問卷的影片標示「問卷預設來源」', async () => {
    addVideo(world, { id: 'v1', stage: 'plan' });
    addVideo(world, { id: 'v2', stage: 'questionnaire' });
    submitQuestionnaire('v1', '2026-11-02T00:00:00Z');
    submitQuestionnaire('v2', '2026-11-03T00:00:00Z');
    expect(Object.fromEntries((await cards()).map((c) => [c.id, c.isDefaultsSource]))).toEqual({ v1: true, v2: false });
  });

  it.each([
    ['?status=nobody', 400, '狀態篩選不正確'],
    ['?sort=nobody', 400, '排序方式不正確'],
  ] as const)('%s：%i %s', async (query, status, message) => {
    const response = await app.inject({ method: 'GET', url: `/api/series/s1/videos${query}` });
    expect(response.statusCode).toBe(status);
    expect(apiErrorSchema.parse(response.json()).message).toBe(message);
  });
});

describe('GET/PATCH /api/series/:id/questionnaire-defaults 系列問卷預設值', () => {
  type DefaultsBody = { rows: { questionId: string; title: string; value: string; edited: boolean }[]; sourceVideo: { id: string; title: string } | null };

  async function read(): Promise<DefaultsBody> {
    const response = await app.inject({ method: 'GET', url: '/api/series/s1/questionnaire-defaults' });
    expect(response.statusCode).toBe(200);
    return response.json() as DefaultsBody;
  }

  function setDefaults(defaults: Record<string, unknown>) {
    world.db.update(series).set({ questionnaireDefaults: defaults }).where(eq(series.id, 's1')).run();
  }

  it('沒有預設值時是空的，也沒有來源影片', async () => {
    expect(await read()).toEqual({ rows: [], sourceVideo: null });
  });

  it('逐題列出答案，來源影片是系列第一支送出問卷的影片', async () => {
    addVideo(world, { id: 'v1', stage: 'plan', creativeInput: '講媽祖的故事' });
    submitQuestionnaire('v1', '2026-11-02T00:00:00Z');
    setDefaults({ tone: { choice: '溫暖' }, length: { choice: '30 秒' } });
    const body = await read();
    expect(body.rows.map((r) => [r.title, r.value, r.edited])).toEqual([
      ['語氣', '溫暖', false],
      ['長度', '30 秒', false],
    ]);
    expect(body.sourceVideo).toMatchObject({ id: 'v1', title: '板橋慈惠宮：講媽祖的故事' });
  });

  it('PATCH 修改一題、清除一題，修改過的標示 edited，其他題保留', async () => {
    setDefaults({ tone: { choice: '溫暖' }, length: { choice: '30 秒' }, goal: { choice: '介紹歷史' } });
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/series/s1/questionnaire-defaults',
      payload: { defaults: { tone: { choice: '輕鬆' }, length: null } },
    });
    expect(response.statusCode).toBe(200);
    const body = await read();
    expect(body.rows.map((r) => [r.questionId, r.value, r.edited])).toEqual([
      ['goal', '介紹歷史', false],
      ['tone', '輕鬆', true],
    ]);
  });

  it.each([
    [{ defaults: { no_such: { choice: '溫暖' } } }, 400, '找不到這一題'],
    [{ defaults: { tone: { choice: '搞笑' } } }, 400, '這一題沒有這個選項'],
    [{ defaults: { story: { custom: '故事' } } }, 400, '這一題每支影片各自填寫，不能設為系列預設'],
    [{ defaults: { tone: { choice: '溫暖', custom: '更溫暖' } } }, 400, '選項和自己寫只能擇一'],
    [{}, 400, '沒有要修改的題目'],
  ] as const)('PATCH %j：%i %s', async (payload, status, message) => {
    const response = await app.inject({ method: 'PATCH', url: '/api/series/s1/questionnaire-defaults', payload });
    expect(response.statusCode).toBe(status);
    expect(apiErrorSchema.parse(response.json()).message).toBe(message);
  });

  it.each(['GET', 'PATCH'] as const)('%s 系列不存在：404', async (method) => {
    const response = await app.inject({ method, url: '/api/series/nope/questionnaire-defaults', ...(method === 'PATCH' ? { payload: { defaults: { tone: null } } } : {}) });
    expect(response.statusCode).toBe(404);
    expect(apiErrorSchema.parse(response.json()).message).toBe('找不到這個系列');
  });
});

describe('影片建立時保存系列設定', () => {
  async function createVideo() {
    const response = await app.inject({ method: 'POST', url: '/api/videos', payload: { seriesId: 's1', templeId: 't1' } });
    expect(response.statusCode).toBe(201);
    return (response.json() as { video: { id: string; seriesSnapshot: Record<string, unknown> | null } }).video;
  }

  it('建立影片時保存視覺風格、方向、預設模型與問卷預設值', async () => {
    world.db.update(series).set({ questionnaireDefaults: { tone: { choice: '溫暖' } } }).where(eq(series.id, 's1')).run();
    const video = await createVideo();
    expect(video.seriesSnapshot).toEqual({
      visualStyle: '溫暖寫實、黃昏暖色調',
      direction: '歷史故事',
      defaultImageModel: 'nano-banana-pro',
      defaultVideoModel: 'gemini-omni-1.1-flash',
      questionnaireDefaults: { tone: { choice: '溫暖' } },
    });
  });

  it('之後修改系列，已建立影片保存的設定不變；新影片拿到新的設定', async () => {
    const first = await createVideo();
    const patched = await app.inject({ method: 'PATCH', url: '/api/series/s1', payload: { visualStyle: '水墨淡彩', defaultVideoModel: 'seedance-2.0' } });
    expect(patched.statusCode).toBe(200);
    const detail = await app.inject({ method: 'GET', url: `/api/videos/${first.id}` });
    expect((detail.json() as { video: { seriesSnapshot: { visualStyle: string; defaultVideoModel: string } } }).video.seriesSnapshot).toMatchObject({
      visualStyle: '溫暖寫實、黃昏暖色調',
      defaultVideoModel: 'gemini-omni-1.1-flash',
    });
    const second = await createVideo();
    expect(second.seriesSnapshot).toMatchObject({ visualStyle: '水墨淡彩', defaultVideoModel: 'seedance-2.0' });
  });

  it('設定了「新影片的費用上限」時，新影片帶入這個上限', async () => {
    const saved = await app.inject({ method: 'PATCH', url: '/api/settings', payload: { defaultVideoCostLimitCredits: 5000 } });
    expect(saved.statusCode).toBe(200);
    expect((saved.json() as { settings: { defaultVideoCostLimitCredits: number | null } }).settings.defaultVideoCostLimitCredits).toBe(5000);
    const video = await createVideo();
    const detail = await app.inject({ method: 'GET', url: `/api/videos/${video.id}` });
    expect((detail.json() as { video: { costLimit: number | null } }).video.costLimit).toBe(5000);
  });

  it('只改單筆同意門檻時，不會動到新影片的費用上限', async () => {
    await app.inject({ method: 'PATCH', url: '/api/settings', payload: { defaultVideoCostLimitCredits: 5000 } });
    const response = await app.inject({ method: 'PATCH', url: '/api/settings', payload: { consentThresholdCredits: 300 } });
    expect(response.statusCode).toBe(200);
    const settings = (response.json() as { settings: { consentThresholdCredits: number | null; defaultVideoCostLimitCredits: number | null } }).settings;
    expect(settings).toMatchObject({ consentThresholdCredits: 300, defaultVideoCostLimitCredits: 5000 });
  });

  it('新影片的費用上限不是整數點數：400', async () => {
    const response = await app.inject({ method: 'PATCH', url: '/api/settings', payload: { defaultVideoCostLimitCredits: 1.5 } });
    expect(response.statusCode).toBe(400);
  });
});

describe('角色庫、版本與用到的影片 API', () => {
  function service() {
    return createCharacterService({ db: world.db, clock: world.clock, workflows: world.workflows, prompts: world.prompts, generation: null });
  }

  async function addSeriesCharacter(name: string, description = '戴斗笠的人') {
    const response = await app.inject({ method: 'POST', url: '/api/series/s1/characters', payload: { name, description, continuityLocks: ['straw hat'] } });
    expect(response.statusCode).toBe(201);
    return (response.json() as { character: { id: string } }).character.id;
  }

  async function names(query: string): Promise<string[]> {
    const response = await app.inject({ method: 'GET', url: `/api/series/s1/characters${query}` });
    expect(response.statusCode).toBe(200);
    return (response.json() as { characters: { name: string }[] }).characters.map((c) => c.name);
  }

  it('角色庫列出系列角色，加上這個系列影片的影片專屬角色', async () => {
    addVideo(world, { id: 'v1' });
    service().resolve('v1', [{ name: '小晴', description: '朱紅背心' }]);
    await addSeriesCharacter('阿公');
    expect((await names('')).sort()).toEqual(['小晴', '阿公']);
  });

  it('依範圍篩選：series 只列系列角色、video 只列影片專屬角色', async () => {
    addVideo(world, { id: 'v1' });
    service().resolve('v1', [{ name: '小晴', description: '朱紅背心' }]);
    await addSeriesCharacter('阿公');
    expect(await names('?scope=series')).toEqual(['阿公']);
    expect(await names('?scope=video')).toEqual(['小晴']);
    expect((await names('?scope=all')).sort()).toEqual(['小晴', '阿公']);
  });

  it('依名稱或描述搜尋', async () => {
    await addSeriesCharacter('阿公', '八十歲、戴斗笠的漁夫');
    await addSeriesCharacter('阿嬤', '七十歲、短白髮');
    expect(await names('?q=斗笠')).toEqual(['阿公']);
    expect(await names(`?q=${encodeURIComponent('阿嬤')}`)).toEqual(['阿嬤']);
    expect(await names(`?q=${encodeURIComponent('找不到')}`)).toEqual([]);
  });

  it('其他系列的影片專屬角色不會出現在這個系列的角色庫', async () => {
    world.db.insert(series).values({ id: 's2', name: '別的系列', visualStyle: 'x', direction: 'x', defaultImageModel: 'nano-banana-pro', defaultVideoModel: 'gemini-omni-1.1-flash', createdAt: 'x', updatedAt: 'x' }).run();
    world.db.insert(videos).values({ id: 'other', seriesId: 's2', templeId: 't1', stage: 'chat', imageModel: 'nano-banana-pro', videoModel: 'gemini-omni-1.1-flash', createdAt: 'x', updatedAt: 'x' }).run();
    service().resolve('other', [{ name: '別人家的阿公', description: '白鬍子' }]);
    expect(await names('')).toEqual([]);
  });

  it('角色卡帶「用在幾支影片」', async () => {
    addVideo(world, { id: 'v1' });
    const id = service().resolve('v1', [{ name: '小晴', description: '朱紅背心' }]).get('小晴') ?? '';
    const response = await app.inject({ method: 'GET', url: '/api/series/s1/characters?scope=video' });
    const character = (response.json() as { characters: { id: string; videoCount: number }[] }).characters.find((c) => c.id === id);
    expect(character?.videoCount).toBe(1);
  });

  it('GET /api/characters/:cid/versions 列出所有版本，舊的在前', async () => {
    const id = await addSeriesCharacter('阿公');
    const response = await app.inject({ method: 'GET', url: `/api/characters/${id}/versions` });
    expect(response.statusCode).toBe(200);
    const { versions } = response.json() as { versions: { version: number; description: string; changeNote: string | null; confirmedAt: string | null }[] };
    expect(versions.map((v) => [v.version, v.description, v.confirmedAt])).toEqual([[1, '戴斗笠的人', null]]);
  });

  it('GET /api/characters/:cid/usage 列出用到這個角色的影片', async () => {
    addVideo(world, { id: 'v1', stage: 'plan' });
    const id = service().resolve('v1', [{ name: '小晴', description: '朱紅背心' }]).get('小晴') ?? '';
    const response = await app.inject({ method: 'GET', url: `/api/characters/${id}/usage` });
    expect(response.statusCode).toBe(200);
    const { videos: used } = response.json() as { videos: { id: string; seriesId: string; title: string; stage: string; version: number }[] };
    expect(used).toMatchObject([{ id: 'v1', seriesId: 's1', title: '板橋慈惠宮', stage: 'plan', version: 1 }]);
  });

  it.each([
    ['GET', '/api/characters/nope/versions'],
    ['GET', '/api/characters/nope/usage'],
  ] as const)('%s %s：找不到這個角色', async (method, url) => {
    const response = await app.inject({ method, url });
    expect(response.statusCode).toBe(404);
    expect(apiErrorSchema.parse(response.json()).message).toBe('找不到這個角色');
  });

  it.each([
    ['?scope=nobody', '篩選條件不正確'],
  ] as const)('%s：400 %s', async (query, message) => {
    const response = await app.inject({ method: 'GET', url: `/api/series/s1/characters${query}` });
    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).message).toBe(message);
  });
});
