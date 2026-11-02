import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createComfyClient, createLimiter, createMcpSession, type ComfyClient } from '@templeyard/comfy-client';
import { loadWorkflowConfig, workflowsFile } from '@templeyard/prompts';
import type { McpCall, WorkflowConfig } from '@templeyard/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FAKE_API_KEY, FAKE_PNG, startFakeComfyMcp, type FakeComfyMcp } from '../../../../tests/fakes/comfy-mcp/server.js';
import { findAsset } from '../assets/repository.js';
import { createAssetStore } from '../assets/store.js';
import { createConsentStore, type ConsentStore } from '../costs/consents.js';
import { updateSettings } from '../costs/repository.js';
import { openDatabase, type AppDatabase } from '../db/client.js';
import { generations, series, temples, videos, type GenerationRow } from '../db/schema.js';
import type { Clock } from '../series/repository.js';
import { createGenerationService, type GenerationRequest, type GenerationService } from './service.js';

let workflows: WorkflowConfig;

let fake: FakeComfyMcp | undefined;
let db: AppDatabase;
let assetsDir = '';
let consents: ConsentStore;
let fakeNow = 0;

function clock(): Clock {
  let id = 0;
  return { now: () => new Date(Date.UTC(2026, 10, 3, 9, 0) + fakeNow), newId: () => `id-${++id}` };
}

function comfy(): ComfyClient {
  return createComfyClient({
    session: createMcpSession({ url: currentFake().url, apiKey: FAKE_API_KEY }),
    pollMs: 1000,
    timeoutMs: 5000,
    now: () => Date.UTC(2026, 10, 3, 9, 0) + fakeNow,
    sleep: async (ms) => {
      fakeNow += ms;
    },
  });
}

function service(options: { limit?: number; handlers?: Record<string, (g: GenerationRow, ids: string[]) => void> } = {}): GenerationService {
  return createGenerationService({
    db,
    comfy: comfy(),
    store: createAssetStore(assetsDir),
    workflows,
    consents,
    limiter: createLimiter(options.limit ?? 3),
    clock: clock(),
    handlers: options.handlers ?? {},
  });
}

const geminiCall = (prompt: string): McpCall => ({
  tool: 'run_template',
  args: { name: 'api_google_gemini_omni_flash_1_1_t2v', input_overrides: { 26: { 'model.prompt': prompt } } },
});

function request(prompt: string, patch: Partial<GenerationRequest> = {}): GenerationRequest {
  return {
    videoId: 'video-1',
    node: 'shot-video',
    target: { shotKey: 's1' },
    promptRef: { id: 'shot-video', version: 4 },
    modelKey: 'gemini-omni-1.1-flash',
    call: geminiCall(prompt),
    costItems: [{ model: 'gemini-omni-1.1-flash', units: 4 }],
    input: { prompt },
    outputKind: 'clip',
    ...patch,
  };
}

function row(id: string): GenerationRow {
  const found = db.select().from(generations).where(eq(generations.id, id)).get();
  if (!found) throw new Error(`沒有這筆生成紀錄：${id}`);
  return found;
}

function currentFake(): FakeComfyMcp {
  if (!fake) throw new Error('假的 MCP 伺服器沒有啟動');
  return fake;
}

const generateCalls = () => currentFake().calls.filter((c) => c.tool === 'run_template' || c.tool === 'partner_generate');

beforeEach(async () => {
  fakeNow = 0;
  fake = await startFakeComfyMcp();
  workflows = loadWorkflowConfig(workflowsFile);
  assetsDir = mkdtempSync(path.join(tmpdir(), 'templeyard-gen-'));
  db = openDatabase(':memory:');
  // 生成紀錄掛在影片上：準備一支影片
  db.insert(temples)
    .values({
      id: 't1',
      name: '測試宮',
      nameNormalized: '測試宮',
      flags: [],
      status: 'active',
      district: '板橋區',
      address: '地址',
      phoneRaw: '',
      deity: '媽祖',
      religion: '道教',
      foundedRaw: '',
      rebuiltRaw: '',
    })
    .run();
  db.insert(series)
    .values({
      id: 's1',
      name: '系列',
      visualStyle: '寫實',
      durationSec: 30,
      direction: '歷史故事',
      defaultImageModel: 'nano-banana-pro',
      defaultVideoModel: 'gemini-omni-1.1-flash',
      createdAt: 'x',
      updatedAt: 'x',
    })
    .run();
  db.insert(videos)
    .values({
      id: 'video-1',
      seriesId: 's1',
      templeId: 't1',
      stage: 'creating',
      imageModel: 'nano-banana-pro',
      videoModel: 'gemini-omni-1.1-flash',
      createdAt: 'x',
      updatedAt: 'x',
    })
    .run();
  updateSettings(db, { consentThresholdCredits: 200 });
  let n = 0;
  consents = createConsentStore({ now: () => new Date(), newToken: () => `consent-${++n}` });
});

afterEach(async () => {
  await fake?.close();
  fake = undefined;
  rmSync(assetsDir, { recursive: true, force: true });
});

describe('付費生成前的同意', () => {
  it('超過單筆門檻又沒有同意憑證時不送出，也不留下紀錄', async () => {
    updateSettings(db, { consentThresholdCredits: 100 });

    const outcome = await service().submit(request('廟埕'));

    expect(outcome.status).toBe('consent_required');
    if (outcome.status !== 'consent_required') return;
    expect(outcome.check.consent.reasons.map((r) => r.code)).toEqual(['over_threshold']);
    expect(outcome.check.estimate.credits).toBe(124);
    expect(generateCalls()).toEqual([]);
    expect(db.select().from(generations).all()).toEqual([]);
  });

  it('單價待實測時一定要同意', async () => {
    const outcome = await service().submit(
      request('廟埕', { modelKey: 'seedance-2.0', costItems: [{ model: 'seedance-2.0', units: 5 }] }),
    );

    expect(outcome.status).toBe('consent_required');
    expect(generateCalls()).toEqual([]);
  });

  it('帶著有效的同意憑證就送出；同一張憑證不能再用', async () => {
    updateSettings(db, { consentThresholdCredits: 100 });
    const items = [{ model: 'gemini-omni-1.1-flash', units: 4 }];
    const { token } = consents.issue('video-1', items);
    const generation = service();

    const first = await generation.submit(request('廟埕', { consentToken: token }));
    const second = await generation.submit(request('廟埕', { consentToken: token }));

    expect(first.status).toBe('accepted');
    expect(second.status).toBe('consent_required');
    // 等送出的任務結束，背景輪詢才不會在下一個測試繼續推進假時間
    if (first.status === 'accepted') await generation.whenSettled(first.generationId);
  });

  it('門檻內不需要憑證', async () => {
    const generation = service();
    const outcome = await generation.submit(request('廟埕'));

    expect(outcome.status).toBe('accepted');
    if (outcome.status === 'accepted') await generation.whenSettled(outcome.generationId);
  });
});

describe('送出、雲端確認、追蹤與結算', () => {
  it('先不帶 confirm 送出，雲端要求確認時記下文字，再帶 confirm: true；完成後下載並結算', async () => {
    const handled: string[][] = [];
    const generation = service({ handlers: { 'shot-video': (_g, ids) => handled.push(ids) } });

    const outcome = await generation.submit(request('廟埕黃昏'));
    if (outcome.status !== 'accepted') throw new Error('沒有送出');
    const settled = await generation.whenSettled(outcome.generationId);

    expect(generateCalls().map((c) => c.args?.confirm)).toEqual([undefined, true]);
    expect(settled).toMatchObject({
      status: 'succeeded',
      videoId: 'video-1',
      node: 'shot-video',
      promptIdRef: 'shot-video',
      promptVersion: 4,
      mcpTool: 'run_template',
      model: 'gemini-omni-1.1-flash',
      callConfigVersion: 1,
      confirmRequired: true,
      confirmMessage: expect.stringContaining('confirm: true'),
      estimatedCost: 124,
      reservedCost: 0,
      actualCost: 124,
      error: null,
    });
    expect(settled.providerTaskId).toBeTruthy();
    expect(settled.finishedAt).toBeTruthy();

    expect(handled).toHaveLength(1);
    const assetId = handled[0]?.[0] ?? '';
    const asset = findAsset(db, assetId);
    expect(asset).toMatchObject({ kind: 'clip', mime: 'image/png', cloudOk: true });
    expect(readFileSync(path.join(assetsDir, asset?.path ?? ''))).toEqual(FAKE_PNG);
  });

  it('拿到 prompt_id 後立刻寫入紀錄（結束前就查得到）', async () => {
    const generation = service();

    const outcome = await generation.submit(request('[never] 一直在跑'));
    if (outcome.status !== 'accepted') throw new Error('沒有送出');

    await expect.poll(() => row(outcome.generationId).providerTaskId).toBeTruthy();
    expect(['submitted', 'running']).toContain(row(outcome.generationId).status);
    expect(row(outcome.generationId).reservedCost).toBe(124);
    await generation.whenSettled(outcome.generationId);
  });

  it('雲端回報失敗時標示失敗、退回預留、記下原因', async () => {
    const generation = service();

    const outcome = await generation.submit(request('[fail]'));
    if (outcome.status !== 'accepted') throw new Error('沒有送出');
    const settled = await generation.whenSettled(outcome.generationId);

    expect(settled).toMatchObject({ status: 'failed', reservedCost: 0, actualCost: null, error: '假的雲端錯誤：內容未通過審查' });
  });

  it('逾時時標示 timeout，保留 prompt_id 之後可以再查', async () => {
    const generation = service();

    const outcome = await generation.submit(request('[never]'));
    if (outcome.status !== 'accepted') throw new Error('沒有送出');
    const settled = await generation.whenSettled(outcome.generationId);

    expect(settled.status).toBe('timeout');
    expect(settled.providerTaskId).toBeTruthy();
    expect(settled.error).toBe('等待超過時間還沒完成，任務可能仍在雲端執行；保留任務編號，之後可以再查詢');
  });

  it('紀錄裡沒有金鑰', async () => {
    const generation = service();

    const outcome = await generation.submit(request('廟埕'));
    if (outcome.status !== 'accepted') throw new Error('沒有送出');
    await generation.whenSettled(outcome.generationId);

    expect(JSON.stringify(db.select().from(generations).all())).not.toContain(FAKE_API_KEY);
  });

  it('同時執行數為 1 時，第二筆等第一筆結束才送出', async () => {
    const generation = service({ limit: 1 });

    const a = await generation.submit(request('第一格'));
    const b = await generation.submit(request('第二格'));
    if (a.status !== 'accepted' || b.status !== 'accepted') throw new Error('沒有送出');
    await Promise.all([generation.whenSettled(a.generationId), generation.whenSettled(b.generationId)]);

    const firstTask = row(a.generationId).providerTaskId;
    const toolCalls = currentFake().calls.filter((c) => c.method === 'tools/call');
    const firstOutput = toolCalls.findIndex((c) => c.tool === 'get_output' && c.args?.prompt_id === firstTask);
    const secondSubmit = toolCalls.findIndex((c) => c.tool === 'run_template' && JSON.stringify(c.args).includes('第二格'));
    expect(firstOutput).toBeGreaterThanOrEqual(0);
    expect(secondSubmit).toBeGreaterThan(firstOutput);
  });
});

describe('重啟後取回', () => {
  it('已送出的紀錄以 prompt_id 繼續追蹤，不重新送出、不重複付費', async () => {
    // 重啟前：雲端已經有這個任務，紀錄停在 submitted
    const direct = comfy();
    const submitted = await direct.submit(geminiCall('重啟前'), { confirm: true });
    if (submitted.kind !== 'submitted') throw new Error('沒有送出');
    db.insert(generations)
      .values({
        id: 'g-before',
        videoId: 'video-1',
        node: 'shot-video',
        target: {},
        mcpTool: 'run_template',
        model: 'gemini-omni-1.1-flash',
        providerTaskId: submitted.promptId,
        status: 'submitted',
        input: {},
        estimatedCost: 124,
        reservedCost: 124,
        createdAt: new Date(Date.UTC(2026, 10, 3, 9, 0)).toISOString(),
      })
      .run();
    const handled: string[] = [];

    const restarted = service({ handlers: { 'shot-video': (g) => handled.push(g.id) } });
    await restarted.resumeUnfinished();
    const settled = await restarted.whenSettled('g-before');

    expect(settled).toMatchObject({ status: 'succeeded', reservedCost: 0, actualCost: 124 });
    expect(handled).toEqual(['g-before']);
    expect(generateCalls()).toHaveLength(1);
  });

  it('重啟時還沒拿到 prompt_id 的紀錄標示失敗、退回預留，不自動重送', async () => {
    db.insert(generations)
      .values({
        id: 'g-pending',
        videoId: 'video-1',
        node: 'shot-video',
        target: {},
        mcpTool: 'run_template',
        model: 'gemini-omni-1.1-flash',
        status: 'awaiting_confirm',
        input: {},
        estimatedCost: 124,
        reservedCost: 124,
        createdAt: 'x',
      })
      .run();

    await service().resumeUnfinished();

    expect(row('g-pending')).toMatchObject({
      status: 'failed',
      reservedCost: 0,
      error: '系統重新啟動時這筆生成還沒送出，沒有重送；需要時請重新生成',
    });
    expect(generateCalls()).toEqual([]);
  });
});
