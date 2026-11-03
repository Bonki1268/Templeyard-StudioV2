import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createComfyClient, createMcpSession, createMcpUploadTransport } from '@templeyard/comfy-client';
import { loadWorkflowConfig } from '@templeyard/prompts';
import {
  apiErrorSchema,
  templeBoardResponseSchema,
  videoDetailResponseSchema,
  videoResponseSchema,
  type TempleBoard,
} from '@templeyard/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { echoWriterResponse, createFakeWriter } from '../../../../tests/fakes/claude/fake-writer.js';
import { FAKE_API_KEY, startFakeComfyMcp, type FakeComfyMcp } from '../../../../tests/fakes/comfy-mcp/server.js';
import { buildApp } from '../app.js';
import { createAssetStore } from '../assets/store.js';
import { createConsentStore } from '../costs/consents.js';
import { openDatabase, type AppDatabase } from '../db/client.js';
import { series, temples, videos } from '../db/schema.js';
import { addPhoto, e2eWorkflowsFile } from '../templeBoards/__fixtures__/world.js';

let fake: FakeComfyMcp;
let db: AppDatabase;
let app: FastifyInstance;
let assetsDir: string;
let fakeNow = 0;

const workflows = () => loadWorkflowConfig(e2eWorkflowsFile);

function insertBase() {
  for (const [id, name] of [
    ['t1', '板橋慈惠宮'],
    ['t2', '淡水福佑宮'],
  ] as const) {
    db.insert(temples)
      .values({
        id,
        name,
        nameNormalized: name,
        flags: [],
        status: 'active',
        district: '板橋區',
        address: '地址',
        phoneRaw: '',
        deity: '天上聖母',
        religion: '道教',
        foundedRaw: '',
        rebuiltRaw: '',
      })
      .run();
  }
  db.insert(series)
    .values({
      id: 's1',
      name: '新北廟宇故事',
      visualStyle: '寫實',
      durationSec: 30,
      direction: '歷史故事',
      defaultImageModel: 'nano-banana-pro',
      defaultVideoModel: 'gemini-omni-1.1-flash',
      createdAt: 'x',
      updatedAt: 'x',
    })
    .run();
}

function addVideo(id: string, templeId = 't1') {
  db.insert(videos)
    .values({
      id,
      seriesId: 's1',
      templeId,
      stage: 'creating',
      imageModel: 'nano-banana-pro',
      videoModel: 'gemini-omni-1.1-flash',
      createdAt: 'x',
      updatedAt: 'x',
    })
    .run();
}

let photoCount = 0;

/** 原圖與去識別圖分開存的寺廟照片（和定裝版服務測試同一種建法） */
function photo(viewKey: string | null) {
  const clock = { now: () => new Date(), newId: () => `photo-${++photoCount}` };
  return addPhoto({ db, store: createAssetStore(assetsDir), seriesId: 's1', templeId: 't1', clock }, { viewKey });
}

beforeEach(async () => {
  fakeNow = 0;
  fake = await startFakeComfyMcp();
  db = openDatabase(':memory:');
  assetsDir = mkdtempSync(path.join(tmpdir(), 'templeyard-board-routes-'));
  insertBase();
  addVideo('v1');
  const config = workflows();
  const session = createMcpSession({ url: fake.url, apiKey: FAKE_API_KEY });
  app = buildApp({
    db,
    assetsDir,
    workflows: config,
    consents: createConsentStore({ now: () => new Date(), newToken: () => `consent-${Math.random()}` }),
    generation: {
      comfy: createComfyClient({
        session,
        pollMs: 10,
        now: () => Date.now() + fakeNow,
        sleep: async (ms) => {
          fakeNow += ms;
        },
      }),
      writer: createFakeWriter(echoWriterResponse),
      transport: createMcpUploadTransport(session, config.upload),
    },
  });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await fake.close();
  rmSync(assetsDir, { recursive: true, force: true });
});

async function consentFor(videoId: string, units: number): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/videos/${videoId}/consents`,
    payload: { items: [{ model: 'nano-banana-pro', units }] },
  });
  expect(response.statusCode).toBe(201);
  return (response.json() as { consentToken: string }).consentToken;
}

async function getBoard(videoId: string): Promise<TempleBoard> {
  const response = await app.inject({ method: 'GET', url: `/api/videos/${videoId}/temple-board` });
  expect(response.statusCode).toBe(200);
  return templeBoardResponseSchema.parse(response.json()).board;
}

async function generateBoard(videoId = 'v1', inferredViewKeys: string[] = []): Promise<TempleBoard> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/videos/${videoId}/temple-board/generate`,
    payload: { inferredViewKeys, consentToken: await consentFor(videoId, 1 + inferredViewKeys.length) },
  });
  expect(response.statusCode).toBe(202);
  await expect.poll(async () => (await getBoard(videoId)).views.every((v) => v.state === 'ready')).toBe(true);
  return getBoard(videoId);
}

const post = (url: string, payload: unknown = {}) => app.inject({ method: 'POST', url, payload: payload as Record<string, unknown> });
const message = (response: { json: () => unknown }) => apiErrorSchema.parse(response.json()).message;

describe('產生寺廟定裝版 POST /api/videos/:id/temple-board/generate', () => {
  it('同意後回應 202 與定裝版；完成後視角圖都產生', async () => {
    photo('front_overview');

    const board = await generateBoard('v1', ['courtyard']);

    expect(board.views.map((v) => [v.viewKey, v.source, v.state])).toEqual([
      ['front_overview', 'photo', 'ready'],
      ['courtyard', 'ai_inferred', 'ready'],
    ]);
  });

  it('需要同意卻沒有憑證時回應 409，附上預估與原因', async () => {
    photo('front_overview');

    const response = await post('/api/videos/v1/temple-board/generate', { inferredViewKeys: [] });

    expect(response.statusCode).toBe(409);
    const body = response.json() as { message: string; check: { consent: { reasons: { code: string }[] } } };
    expect(body.message).toBe('這次生成需要先同意費用');
    // 測試資料庫沒設同意門檻，原因還會有 threshold_unset（第 4 階段已測過）；這裡只確認單價待實測在內
    expect(body.check.consent.reasons.map((r) => r.code)).toContain('price_unknown');
  });

  it.each([
    ['AI 推測的視角不在標準清單', { inferredViewKeys: ['custom_gate'] }, 400, '請從清單選擇視角'],
    ['AI 推測的視角不是陣列', { inferredViewKeys: 'courtyard' }, 400, '定裝版的資料不正確'],
  ])('%s：API 回應 %s', async (_label, payload, status, expected) => {
    const response = await post('/api/videos/v1/temple-board/generate', payload);

    expect(response.statusCode).toBe(status);
    const body = apiErrorSchema.parse(response.json());
    expect([body.message, ...Object.values(body.fieldErrors ?? {})]).toContain(expected);
  });

  it('影片不存在時回應 404', async () => {
    const response = await post('/api/videos/nope/temple-board/generate', {});
    expect(response.statusCode).toBe(404);
    expect(message(response)).toBe('找不到這支影片');
  });

  it('沒有設定生成服務時回應 503，說明缺少的設定', async () => {
    const offline = buildApp({ db, assetsDir, workflows: workflows(), generation: null, generationUnavailableMessage: '還沒設定生成服務，不能生成：請在 .env.local 設定 COMFY_MCP_URL' });
    photo('front_overview');

    const response = await offline.inject({ method: 'POST', url: '/api/videos/v1/temple-board/generate', payload: {} });

    expect(response.statusCode).toBe(503);
    expect(message(response)).toBe('還沒設定生成服務，不能生成：請在 .env.local 設定 COMFY_MCP_URL');
    await offline.close();
  });
});

describe('讀取定裝版 GET /api/videos/:id/temple-board', () => {
  it('還沒產生時回應 404', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/videos/v1/temple-board' });
    expect(response.statusCode).toBe(404);
    expect(message(response)).toBe('這支影片還沒產生寺廟定裝版');
  });
});

describe('單張重生與確認', () => {
  beforeEach(() => {
    photo('front_overview');
  });

  it('重生帶修改指令，回應 202；完成後標示需重新確認', async () => {
    await generateBoard();

    const response = await post('/api/videos/v1/temple-board/views/front_overview/regenerate', {
      instruction: '燈光暗一點',
      consentToken: await consentFor('v1', 1),
    });

    expect(response.statusCode).toBe(202);
    await expect.poll(async () => (await getBoard('v1')).views[0]?.state).toBe('ready');
    expect((await getBoard('v1')).views[0]).toMatchObject({ confirmed: false, lastInstruction: '燈光暗一點' });
  });

  it('修改指令超過 500 字時回應 400', async () => {
    await generateBoard();

    const response = await post('/api/videos/v1/temple-board/views/front_overview/regenerate', { instruction: '字'.repeat(501) });

    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).fieldErrors?.instruction).toBe('修改指令最多 500 字');
  });

  it('確認單張、確認定裝版：回應影片進入對話', async () => {
    await generateBoard('v1', ['courtyard']);

    const blocked = await post('/api/videos/v1/temple-board/confirm');
    expect(blocked.statusCode).toBe(409);
    expect(message(blocked)).toBe('「廟埕」為 AI 推測，請先確認或補傳照片');

    expect((await post('/api/videos/v1/temple-board/views/courtyard/confirm')).statusCode).toBe(200);
    const confirmed = await post('/api/videos/v1/temple-board/confirm');
    expect(confirmed.statusCode).toBe(200);
    expect(videoResponseSchema.parse(confirmed.json()).video.stage).toBe('chat');
  });

  it('修改外觀規範與光線 PATCH；資料不正確時回應 400', async () => {
    await generateBoard();

    const ok = await app.inject({
      method: 'PATCH',
      url: '/api/videos/v1/temple-board',
      payload: { appearanceLocks: ['grey granite dragon columns'], defaultLighting: '黃昏' },
    });
    expect(ok.statusCode).toBe(200);
    expect(templeBoardResponseSchema.parse(ok.json()).board.version).toMatchObject({
      appearanceLocks: ['grey granite dragon columns'],
      defaultLighting: '黃昏',
    });

    const bad = await app.inject({ method: 'PATCH', url: '/api/videos/v1/temple-board', payload: { defaultLighting: '正中午' } });
    expect(bad.statusCode).toBe(400);
    expect(apiErrorSchema.parse(bad.json()).fieldErrors?.defaultLighting).toBe('請從清單選擇光線與時段');
  });
});

describe('模型鎖定（06 完成條件：模型鎖定後 API 拒絕更改模型）', () => {
  beforeEach(async () => {
    photo('front_overview');
    await generateBoard();
  });

  it.each([
    [{ imageModel: 'nano-banana-pro' }, '模型已在產生寺廟定裝版時鎖定，不能更換'],
    [{ videoModel: 'seedance-2.0' }, '模型已在產生寺廟定裝版時鎖定，不能更換'],
    [{ templeId: 't2' }, '已產生寺廟定裝版，不能更換寺廟'],
  ])('修改 %o 回應 409', async (payload, expected) => {
    const response = await app.inject({ method: 'PATCH', url: '/api/videos/v1', payload });

    expect(response.statusCode).toBe(409);
    expect(message(response)).toBe(expected);
    const detail = videoDetailResponseSchema.parse((await app.inject({ method: 'GET', url: '/api/videos/v1' })).json());
    expect(detail.video).toMatchObject({ imageModel: 'nano-banana-pro', videoModel: 'gemini-omni-1.1-flash', templeId: 't1' });
  });

  it('寺廟歷史與簡介、費用上限仍可以修改', async () => {
    const response = await app.inject({ method: 'PATCH', url: '/api/videos/v1', payload: { userTempleNotes: '清代建廟', costLimit: 3000 } });

    expect(response.statusCode).toBe(200);
  });

  it('影片資料帶出使用的定裝版版本', async () => {
    const detail = videoDetailResponseSchema.parse((await app.inject({ method: 'GET', url: '/api/videos/v1' })).json());
    expect(detail.video.templeBoardVersionId).toBe((await getBoard('v1')).version.id);
    expect(detail.video.stage).toBe('board_pending');
  });
});

describe('沿用與另存新版本', () => {
  beforeEach(async () => {
    photo('front_overview');
    await generateBoard();
    expect((await post('/api/videos/v1/temple-board/confirm')).statusCode).toBe(200);
  });

  it('同系列同一間廟的新影片：影片資料帶出可以沿用的定裝版；沿用後就不再出現', async () => {
    addVideo('v2');

    const before = videoDetailResponseSchema.parse((await app.inject({ method: 'GET', url: '/api/videos/v2' })).json());
    expect(before.reusableBoard).toMatchObject({ version: 1, imageModel: 'nano-banana-pro' });

    const reused = await post('/api/videos/v2/temple-board/reuse');
    expect(reused.statusCode).toBe(200);
    expect(templeBoardResponseSchema.parse(reused.json()).board.pending).toEqual([]);

    const after = videoDetailResponseSchema.parse((await app.inject({ method: 'GET', url: '/api/videos/v2' })).json());
    expect(after.reusableBoard).toBeNull();
    expect(after.video.modelsLockedAt).not.toBeNull();
  });

  it('另一間廟沒有可以沿用的定裝版；沿用時回應 409', async () => {
    addVideo('v3', 't2');

    const detail = videoDetailResponseSchema.parse((await app.inject({ method: 'GET', url: '/api/videos/v3' })).json());
    expect(detail.reusableBoard).toBeNull();
    const response = await post('/api/videos/v3/temple-board/reuse');
    expect(response.statusCode).toBe(409);
    expect(message(response)).toBe('這間廟在這個系列還沒有確認過的寺廟定裝版');
  });

  it('已確認的版本不能重生；另存新版本回應 201 後可以修改', async () => {
    const blocked = await post('/api/videos/v1/temple-board/views/front_overview/regenerate', { consentToken: await consentFor('v1', 1) });
    expect(blocked.statusCode).toBe(409);
    expect(message(blocked)).toBe('這個版本已確認；要修改請先另存新版本');

    const saved = await post('/api/videos/v1/temple-board/versions');
    expect(saved.statusCode).toBe(201);
    expect(templeBoardResponseSchema.parse(saved.json()).board.version).toMatchObject({ version: 2, confirmedAt: null });
  });
});
