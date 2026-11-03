import { loadWorkflowConfig, workflowsFile } from '@templeyard/prompts';
import type { CostItem, TempleBoard } from '@templeyard/shared';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findAsset } from '../assets/repository.js';
import { confirmations, generations, templeBoards, templeBoardVersions, videos } from '../db/schema.js';
import { findVideo } from '../videos/repository.js';
import { addPhoto, addVideo, createWorld, type World } from './__fixtures__/world.js';
import { TEMPLE_VIEW_NODE, TempleBoardError, createTempleBoardService, type TempleBoardService } from './service.js';

let world: World;
let boards: TempleBoardService;

function service(overrides: Partial<Parameters<typeof createTempleBoardService>[0]> = {}): TempleBoardService {
  const created = createTempleBoardService({
    db: world.db,
    clock: world.clock,
    workflows: world.workflows,
    prompts: world.prompts,
    store: world.store,
    generation: { service: world.generation, writer: world.writer, sendAsset: world.sendAsset },
    ...overrides,
  });
  world.handlers[TEMPLE_VIEW_NODE] = created.handleGenerated;
  return created;
}

/** 同意這次的費用，回傳同意憑證 */
function consent(videoId: string, units: number, model = 'nano-banana-pro'): string {
  const items: CostItem[] = [{ model, units }];
  return world.consents.issue(videoId, items).token;
}

/** 等這支影片目前所有的生成結束 */
async function settleAll(): Promise<void> {
  const rows = world.db.select().from(generations).all();
  await Promise.all(rows.map((row) => world.generation.whenSettled(row.id)));
}

function view(board: TempleBoard | null, key: string) {
  const found = board?.views.find((v) => v.viewKey === key);
  if (!found) throw new Error(`定裝版沒有這個視角：${key}`);
  return found;
}

async function expectBoardError(promise: Promise<unknown> | (() => unknown), status: number, message: string) {
  const run = typeof promise === 'function' ? Promise.resolve().then(promise) : promise;
  const error = await run.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(TempleBoardError);
  expect(error).toMatchObject({ status, message });
}

/** 產生一份定裝版：廟前全景依照片，另外 AI 推測的視角 */
async function generated(videoId = 'v1', inferred: ('courtyard' | 'main_hall')[] = []) {
  const outcome = await boards.generate(videoId, { inferredViewKeys: inferred, consentToken: consent(videoId, 1 + inferred.length) });
  expect(outcome.status).toBe('accepted');
  await settleAll();
  return boards.detail(videoId);
}

beforeEach(async () => {
  world = await createWorld();
  addVideo(world, { id: 'v1' });
  boards = service();
});

afterEach(async () => {
  await world.close();
});

describe('產生寺廟定裝版', () => {
  it('依照片與 AI 推測，每個視角各送出一筆生成，完成後接上視角圖', async () => {
    addPhoto(world, { viewKey: 'front_overview' });

    const board = await generated('v1', ['courtyard']);

    expect(board?.views.map((v) => [v.viewKey, v.viewName, v.source, v.state])).toEqual([
      ['front_overview', '廟前全景', 'photo', 'ready'],
      ['courtyard', '廟埕', 'ai_inferred', 'ready'],
    ]);
    const rows = world.db.select().from(generations).where(eq(generations.node, TEMPLE_VIEW_NODE)).all();
    expect(rows).toHaveLength(2);
    for (const v of board?.views ?? []) {
      expect(v.assetId).not.toBeNull();
      expect(findAsset(world.db, v.assetId ?? '')?.kind).toBe('view');
    }
  });

  it('依照片的視角自動確認；AI 推測的視角要使用者確認', async () => {
    addPhoto(world, { viewKey: 'front_overview' });

    const board = await generated('v1', ['courtyard']);

    expect(view(board, 'front_overview').confirmed).toBe(true);
    expect(view(board, 'courtyard').confirmed).toBe(false);
    expect(board?.pending).toEqual(['「廟埕」為 AI 推測，請先確認或補傳照片']);
  });

  it('鎖定模型、影片進入定裝版待確認；第 1 版用這支影片的圖片模型與預設光線', async () => {
    addPhoto(world, { viewKey: 'front_overview' });

    const board = await generated();

    const video = findVideo(world.db, 'v1');
    expect(video?.modelsLockedAt).toBe('2026-11-03T09:00:00.000Z');
    expect(video?.stage).toBe('board_pending');
    expect(video?.templeBoardVersionId).toBe(board?.version.id);
    expect(board?.version).toMatchObject({ version: 1, imageModel: 'nano-banana-pro', appearanceLocks: [], defaultLighting: '晴天午後', confirmedAt: null });
    expect(board?.templeName).toBe('板橋慈惠宮');
  });

  it('最終指令由撰寫者依 temple-view 寫成，送到 Nano Banana Pro 的 prompt，比例 16:9', async () => {
    addPhoto(world, { viewKey: 'front_overview' });

    await generated();

    const request = world.writer.calls[0];
    expect(request?.system).toContain('寺廟定裝版的視角圖');
    expect(request?.system).toContain('Nano Banana Pro 寫法');
    expect(request?.content).toContain('寺廟：板橋慈惠宮（板橋區，主祀天上聖母）');
    expect(request?.content).toContain('視角：廟前全景（front_overview）');
    expect(request?.content).toContain('這個視角的來源：依照片');
    expect(request?.content).toContain('光線與時段：晴天午後');
    expect(request?.content).toContain('系列視覺風格：溫暖寫實、黃昏暖色調');
    const sent = world.fake.calls.find((c) => c.tool === 'partner_generate');
    expect(sent?.args).toMatchObject({ model: 'vertexai/nano-banana-pro', aspect_ratio: '16:9' });
    // 送給雲端的就是撰寫者寫出的最終指令
    expect(sent?.args?.prompt).toBe(`Final temple view prompt. ${request?.content ?? ''}`);
    const row = world.db.select().from(generations).get();
    expect(row).toMatchObject({ promptIdRef: 'temple-view', model: 'vertexai/nano-banana-pro', target: { viewKey: 'front_overview' } });
  });

  it('參考圖只上傳去識別後的照片，原圖一次都不送出；這個視角自己的照片排在最前面', async () => {
    const other = addPhoto(world, { viewKey: 'main_hall' });
    const own = addPhoto(world, { viewKey: 'front_overview' });

    // 兩個視角都有照片，所以要同意 2 張
    const outcome = await boards.generate('v1', { inferredViewKeys: [], consentToken: consent('v1', 2) });
    expect(outcome.status).toBe('accepted');
    await settleAll();

    const uploaded = world.fake.uploads.map((u) => u.sha256);
    expect(uploaded).toContain(own.deidSha256);
    expect(uploaded).not.toContain(own.originalSha256);
    expect(uploaded).not.toContain(other.originalSha256);
    const calls = world.fake.calls.filter((c) => c.tool === 'partner_generate');
    const refs = calls.map((c) => c.args?.fake_reference_images);
    // 兩個視角（廟前全景、正殿內部）各自把自己的照片放第一張
    expect(refs).toHaveLength(2);
    expect(world.writer.calls[0]?.content).toContain('Image 1（地理、建築外觀）：廟前全景');
    expect(world.writer.calls[0]?.content).toContain('Image 2（建築外觀）：正殿內部');
  });

  it('AI 推測的視角說明沒有這個視角的照片，其他照片只參考建築外觀', async () => {
    addPhoto(world, { viewKey: 'front_overview' });

    await generated('v1', ['courtyard']);

    const inferred = world.writer.calls.find((c) => c.content.includes('視角：廟埕'));
    expect(inferred?.content).toContain('這個視角的來源：AI 推測');
    expect(inferred?.content).toContain('沒有這個視角的照片');
    expect(inferred?.content).toContain('Image 1（建築外觀）：廟前全景');
  });

  it('需要同意卻沒有同意憑證時：不呼叫撰寫者、不上傳、不送出、不鎖定模型', async () => {
    addPhoto(world, { viewKey: 'front_overview' });

    const outcome = await boards.generate('v1', { inferredViewKeys: ['courtyard'] });

    expect(outcome.status).toBe('consent_required');
    if (outcome.status !== 'consent_required') return;
    expect(outcome.check.consent.reasons.map((r) => r.code)).toEqual(['price_unknown']);
    expect(outcome.check.estimate.lines).toEqual([{ model: 'nano-banana-pro', units: 2, unitCredits: null, credits: null }]);
    expect(world.writer.calls).toEqual([]);
    expect(world.fake.uploads).toEqual([]);
    expect(world.db.select().from(generations).all()).toEqual([]);
    expect(world.db.select().from(templeBoards).all()).toEqual([]);
    expect(findVideo(world.db, 'v1')?.modelsLockedAt).toBeNull();
  });

  it('同意憑證的張數和這次要產生的視角數不同時，視為沒有同意', async () => {
    addPhoto(world, { viewKey: 'front_overview' });

    const outcome = await boards.generate('v1', { inferredViewKeys: ['courtyard'], consentToken: consent('v1', 1) });

    expect(outcome.status).toBe('consent_required');
  });

  it('已經產生過定裝版的影片不能再產生一次', async () => {
    addPhoto(world, { viewKey: 'front_overview' });
    await generated();

    await expectBoardError(
      boards.generate('v1', { consentToken: consent('v1', 1) }),
      409,
      '這支影片已經產生寺廟定裝版，要修改請在定裝版頁重生單張',
    );
    expect(world.db.select().from(templeBoardVersions).all()).toHaveLength(1);
  });

  it('還沒有照片、沒有任何可以產生的視角時拒絕', async () => {
    await expectBoardError(boards.generate('v1', { consentToken: consent('v1', 1) }), 409, '至少要有 1 張去識別後的照片');

    addPhoto(world, { viewKey: null });
    await expectBoardError(
      boards.generate('v1', { consentToken: consent('v1', 1) }),
      409,
      '沒有可以產生的視角：請在照片指定拍到的視角，或讓 AI 推測缺少的視角',
    );
    expect(findVideo(world.db, 'v1')?.modelsLockedAt).toBeNull();
  });

  it('影片不存在時回 404', async () => {
    await expectBoardError(boards.generate('nope', {}), 404, '找不到這支影片');
  });

  it('沒有設定生成服務時回 503，說明缺少的設定', async () => {
    addPhoto(world, { viewKey: 'front_overview' });
    const unavailable = service({ generation: null, unavailableMessage: '還沒設定生成服務：缺少 COMFY_MCP_URL' });

    await expectBoardError(unavailable.generate('v1', {}), 503, '還沒設定生成服務：缺少 COMFY_MCP_URL');
  });

  it('正式設定檔還不知道參考圖與上傳方式：同意後送出前停下來說明待實測，不留下定裝版', async () => {
    const production = await createWorld({ workflows: loadWorkflowConfig(workflowsFile) });
    try {
      addVideo(production, { id: 'v1' });
      addPhoto(production, { viewKey: 'front_overview' });
      const real = createTempleBoardService({
        db: production.db,
        clock: production.clock,
        workflows: production.workflows,
        prompts: production.prompts,
        store: production.store,
        generation: { service: production.generation, writer: production.writer, sendAsset: production.sendAsset },
      });
      const token = production.consents.issue('v1', [{ model: 'nano-banana-pro', units: 1 }]).token;

      const error = await real.generate('v1', { consentToken: token }).then(
        () => null,
        (e: unknown) => e,
      );

      expect(error).toBeInstanceOf(TempleBoardError);
      expect(error).toMatchObject({ status: 503 });
      expect((error as Error).message).toContain('還沒實測');
      expect(production.fake.calls.filter((c) => c.tool === 'partner_generate')).toEqual([]);
      expect(production.db.select().from(templeBoards).all()).toEqual([]);
      expect(findVideo(production.db, 'v1')?.modelsLockedAt).toBeNull();
    } finally {
      await production.close();
    }
  });
});

describe('生成中與失敗', () => {
  it('還在生成時視角標示生成中，不能確認定裝版', async () => {
    // 雲端一直在跑：修改指令裡的 [never] 會一路帶進最終指令
    const slow = await createWorld({ writerResponses: [{ prompt: 'temple view [never]' }] });
    try {
      addVideo(slow, { id: 'v1' });
      addPhoto(slow, { viewKey: 'front_overview' });
      const slowBoards = createTempleBoardService({
        db: slow.db,
        clock: slow.clock,
        workflows: slow.workflows,
        prompts: slow.prompts,
        store: slow.store,
        generation: { service: slow.generation, writer: slow.writer, sendAsset: slow.sendAsset },
      });
      const token = slow.consents.issue('v1', [{ model: 'nano-banana-pro', units: 1 }]).token;
      expect((await slowBoards.generate('v1', { consentToken: token })).status).toBe('accepted');

      const board = slowBoards.detail('v1');
      expect(view(board, 'front_overview').state).toBe('generating');
      expect(board?.pending).toEqual(['「廟前全景」還在生成中']);
      await Promise.all(slow.db.select().from(generations).all().map((row) => slow.generation.whenSettled(row.id)));
    } finally {
      await slow.close();
    }
  });

  it('雲端回報失敗時標示失敗與原因，重生後恢復', async () => {
    addPhoto(world, { viewKey: 'front_overview' });
    await generated();
    world.writer.calls.length = 0;
    const failing = await boards.regenerateView('v1', 'front_overview', { instruction: '[fail]', consentToken: consent('v1', 1) });
    expect(failing.status).toBe('accepted');
    await settleAll();

    const board = boards.detail('v1');
    expect(view(board, 'front_overview')).toMatchObject({ state: 'failed', error: '假的雲端錯誤：內容未通過審查', lastInstruction: '[fail]' });
    expect(board?.pending).toEqual(['「廟前全景」生成失敗，請重生']);
  });
});

describe('單張重生與修改', () => {
  beforeEach(() => {
    addPhoto(world, { viewKey: 'front_overview' });
  });

  it('帶修改指令重生：指令寫進撰寫者的內容，完成後替換視角圖並標示需重新確認', async () => {
    const before = await generated();
    const oldAsset = view(before, 'front_overview').assetId;

    const outcome = await boards.regenerateView('v1', 'front_overview', { instruction: '燈光暗一點', consentToken: consent('v1', 1) });
    expect(outcome.status).toBe('accepted');
    await settleAll();

    const after = view(boards.detail('v1'), 'front_overview');
    expect(world.writer.calls.at(-1)?.content).toContain('使用者調整指令：燈光暗一點');
    expect(after.assetId).not.toBe(oldAsset);
    expect(after).toMatchObject({ confirmed: false, state: 'ready', lastInstruction: '燈光暗一點' });
    const latest = world.db.select().from(generations).all().at(-1);
    expect(latest?.userInstruction).toBe('燈光暗一點');
  });

  it('重生也要先同意費用；沒有憑證時不送出', async () => {
    await generated();
    const count = world.db.select().from(generations).all().length;

    const outcome = await boards.regenerateView('v1', 'front_overview', {});

    expect(outcome.status).toBe('consent_required');
    expect(world.db.select().from(generations).all()).toHaveLength(count);
  });

  it('外觀規範逐字帶入；撰寫者兩次都漏掉時回 502，不送出', async () => {
    const strict = await createWorld({ writerResponses: [{ prompt: 'forgot the locks' }] });
    try {
      addVideo(strict, { id: 'v1' });
      addPhoto(strict, { viewKey: 'front_overview' });
      const strictBoards = createTempleBoardService({
        db: strict.db,
        clock: strict.clock,
        workflows: strict.workflows,
        prompts: strict.prompts,
        store: strict.store,
        generation: { service: strict.generation, writer: strict.writer, sendAsset: strict.sendAsset },
      });
      strict.handlers[TEMPLE_VIEW_NODE] = strictBoards.handleGenerated;
      await strictBoards.generate('v1', { consentToken: strict.consents.issue('v1', [{ model: 'nano-banana-pro', units: 1 }]).token });
      await Promise.all(strict.db.select().from(generations).all().map((row) => strict.generation.whenSettled(row.id)));
      strictBoards.update('v1', { appearanceLocks: ['red swallowtail roof ridge with cut-porcelain dragons'] });
      const before = strict.db.select().from(generations).all().length;
      strict.writer.calls.length = 0;

      const error = await strictBoards
        .regenerateView('v1', 'front_overview', { consentToken: strict.consents.issue('v1', [{ model: 'nano-banana-pro', units: 1 }]).token })
        .then(
          () => null,
          (e: unknown) => e,
        );

      expect(error).toMatchObject({ status: 502, message: '最終指令缺少連續性鎖：red swallowtail roof ridge with cut-porcelain dragons' });
      expect(strict.writer.calls[0]?.content).toContain('外觀規範（逐字帶入）：red swallowtail roof ridge with cut-porcelain dragons');
      expect(strict.writer.calls).toHaveLength(2);
      expect(strict.db.select().from(generations).all()).toHaveLength(before);
    } finally {
      await strict.close();
    }
  });

  it('補傳這個視角的照片後重生：改為依照片', async () => {
    await generated('v1', ['courtyard']);
    const replacement = addPhoto(world, { viewKey: 'courtyard' });

    await boards.regenerateView('v1', 'courtyard', { consentToken: consent('v1', 1) });
    await settleAll();

    expect(view(boards.detail('v1'), 'courtyard')).toMatchObject({
      source: 'photo',
      photoId: replacement.photo.id,
      confirmed: false,
      state: 'ready',
    });
    expect(world.writer.calls.at(-1)?.content).toContain('這個視角的來源：依照片');
  });

  it('還在生成中的視角不能再重生；定裝版沒有的視角回 404', async () => {
    await generated();
    const slowToken = consent('v1', 1);
    expect((await boards.regenerateView('v1', 'front_overview', { instruction: '[never]', consentToken: slowToken })).status).toBe('accepted');

    await expectBoardError(
      boards.regenerateView('v1', 'front_overview', { consentToken: consent('v1', 1) }),
      409,
      '「廟前全景」還在生成中',
    );
    await expectBoardError(boards.regenerateView('v1', 'main_hall', { consentToken: consent('v1', 1) }), 404, '這個定裝版沒有這個視角');
    await settleAll();
  });

  it('還沒產生定裝版的影片不能重生', async () => {
    await expectBoardError(boards.regenerateView('v1', 'front_overview', {}), 404, '這支影片還沒產生寺廟定裝版');
  });
});

describe('確認視角與定裝版', () => {
  beforeEach(() => {
    addPhoto(world, { viewKey: 'front_overview' });
  });

  it('確認 AI 推測的視角後，沒有待處理', async () => {
    await generated('v1', ['courtyard']);

    const board = boards.confirmView('v1', 'courtyard');

    expect(view(board, 'courtyard').confirmed).toBe(true);
    expect(board.pending).toEqual([]);
  });

  it('還有 AI 推測的視角沒確認時，不能確認定裝版', async () => {
    await generated('v1', ['courtyard']);

    await expectBoardError(() => boards.confirm('v1'), 409, '「廟埕」為 AI 推測，請先確認或補傳照片');
    expect(findVideo(world.db, 'v1')?.stage).toBe('board_pending');
  });

  it('確認定裝版：版本標示已確認、成為系列這間廟目前的版本、影片進入對話、留下確認紀錄', async () => {
    const board = await generated();

    const result = boards.confirm('v1');

    expect(result.video.stage).toBe('chat');
    // 假時鐘和輪詢共用，確認時間是確認當下的時間
    expect(result.board.version.confirmedAt).toBe(world.clock.now().toISOString());
    const stored = world.db.select().from(templeBoards).get();
    expect(stored?.currentVersionId).toBe(board?.version.id);
    const records = world.db.select().from(confirmations).where(eq(confirmations.videoId, 'v1')).all();
    expect(records).toEqual([
      expect.objectContaining({ point: 'temple_board', contentRef: { boardVersionId: board?.version.id }, invalidatedAt: null }),
    ]);
  });

  it('已確認的版本不能再修改：重生、改外觀規範、確認單張都拒絕', async () => {
    await generated();
    boards.confirm('v1');

    const message = '這個版本已確認；要修改請先另存新版本';
    await expectBoardError(boards.regenerateView('v1', 'front_overview', { consentToken: consent('v1', 1) }), 409, message);
    await expectBoardError(() => boards.update('v1', { defaultLighting: '黃昏' }), 409, message);
    await expectBoardError(() => boards.confirmView('v1', 'front_overview'), 409, message);
  });

  it('再確認一次不會重複留下確認紀錄', async () => {
    await generated();
    boards.confirm('v1');

    boards.confirm('v1');

    expect(world.db.select().from(confirmations).all()).toHaveLength(1);
  });
});

describe('外觀規範與光線', () => {
  it('修改外觀規範與光線；之後重生的指令使用新的設定', async () => {
    addPhoto(world, { viewKey: 'front_overview' });
    await generated();

    const board = boards.update('v1', { appearanceLocks: ['grey granite dragon columns'], defaultLighting: '黃昏' });

    expect(board.version).toMatchObject({ appearanceLocks: ['grey granite dragon columns'], defaultLighting: '黃昏' });
    world.writer.calls.length = 0;
    const outcome = await boards.regenerateView('v1', 'front_overview', { consentToken: consent('v1', 1) });
    expect(outcome.status).toBe('accepted');
    expect(world.writer.calls[0]?.content).toContain('光線與時段：黃昏');
    expect(world.writer.calls[0]?.content).toContain('外觀規範（逐字帶入）：grey granite dragon columns');
    await settleAll();
  });
});

describe('沿用與另存新版本', () => {
  /** 第一支影片產生並確認定裝版 */
  async function confirmedBoard() {
    addPhoto(world, { viewKey: 'front_overview' });
    await generated('v1');
    return boards.confirm('v1').board;
  }

  it('同系列同一間廟確認過之後才可以沿用', async () => {
    addPhoto(world, { viewKey: 'front_overview' });
    await generated('v1');
    expect(boards.reusableFor('s1', 't1')).toBeNull();

    const board = boards.confirm('v1').board;

    expect(boards.reusableFor('s1', 't1')).toEqual({
      versionId: board.version.id,
      version: 1,
      imageModel: 'nano-banana-pro',
      confirmedAt: board.version.confirmedAt,
    });
    expect(board.version.confirmedAt).not.toBeNull();
    expect(boards.reusableFor('s1', 't2')).toBeNull();
    expect(boards.reusableFor('other-series', 't1')).toBeNull();
  });

  it('沿用：影片使用同一個版本、鎖定模型、不必再生成，可以直接確認', async () => {
    const first = await confirmedBoard();
    addVideo(world, { id: 'v2' });
    const before = world.db.select().from(generations).all().length;

    const board = boards.reuse('v2');

    expect(board.version.id).toBe(first.version.id);
    expect(board.pending).toEqual([]);
    expect(board.otherImageModel).toBe(false);
    expect(findVideo(world.db, 'v2')).toMatchObject({ templeBoardVersionId: first.version.id, stage: 'board_pending' });
    expect(findVideo(world.db, 'v2')?.modelsLockedAt).not.toBeNull();
    expect(world.db.select().from(generations).all()).toHaveLength(before);
    expect(boards.confirm('v2').video.stage).toBe('chat');
  });

  it('沿用的定裝版由其他圖片模型產生時標示出來', async () => {
    await confirmedBoard();
    addVideo(world, { id: 'v3', imageModel: 'nano-banana-2-lite' });

    expect(boards.reuse('v3').otherImageModel).toBe(true);
  });

  it('沒有可以沿用的定裝版、或這支影片已有定裝版時拒絕沿用', async () => {
    addVideo(world, { id: 'v2', templeId: 't2' });
    await expectBoardError(() => boards.reuse('v2'), 409, '這間廟在這個系列還沒有確認過的寺廟定裝版');

    await confirmedBoard();
    await expectBoardError(() => boards.reuse('v1'), 409, '這支影片已經有寺廟定裝版');
  });

  it('另存新版本：複製視角圖與外觀規範，新版本尚未確認；其他影片與系列目前的版本不變', async () => {
    const first = await confirmedBoard();
    addVideo(world, { id: 'v2' });
    boards.reuse('v2');

    const second = boards.saveAsNewVersion('v2');

    expect(second.version).toMatchObject({ version: 2, confirmedAt: null, appearanceLocks: first.version.appearanceLocks });
    expect(second.views.map((v) => [v.viewKey, v.assetId, v.confirmed])).toEqual(first.views.map((v) => [v.viewKey, v.assetId, v.confirmed]));
    expect(findVideo(world.db, 'v2')?.templeBoardVersionId).toBe(second.version.id);
    expect(findVideo(world.db, 'v1')?.templeBoardVersionId).toBe(first.version.id);
    expect(boards.reusableFor('s1', 't1')?.version).toBe(1);
    // 新版本可以修改
    expect(boards.update('v2', { defaultLighting: '夜間點燈' }).version.defaultLighting).toBe('夜間點燈');
    expect(boards.detail('v1')?.version.defaultLighting).toBe('晴天午後');
  });

  it('確認新版本後，系列這間廟目前的版本換成新版本', async () => {
    await confirmedBoard();
    addVideo(world, { id: 'v2' });
    boards.reuse('v2');
    const second = boards.saveAsNewVersion('v2');

    boards.confirm('v2');

    expect(boards.reusableFor('s1', 't1')?.versionId).toBe(second.version.id);
    const versions = world.db.select().from(templeBoardVersions).all();
    expect(versions.map((v) => v.version).sort()).toEqual([1, 2]);
  });

  it('還沒確認的版本不需要另存新版本', async () => {
    addPhoto(world, { viewKey: 'front_overview' });
    await generated('v1');

    await expectBoardError(() => boards.saveAsNewVersion('v1'), 409, '這個版本還沒確認，可以直接修改');
  });
});

describe('定裝版的內容', () => {
  it('還沒產生定裝版時是 null', () => {
    expect(boards.detail('v1')).toBeNull();
  });

  it('定裝版屬於這支影片的系列與寺廟', async () => {
    addPhoto(world, { viewKey: 'front_overview' });
    const board = await generated();

    expect(board).toMatchObject({ seriesId: 's1', templeId: 't1', videoId: 'v1' });
    const stored = world.db
      .select()
      .from(templeBoards)
      .where(and(eq(templeBoards.seriesId, 's1'), eq(templeBoards.templeId, 't1')))
      .all();
    expect(stored).toHaveLength(1);
    expect(world.db.select().from(videos).where(eq(videos.id, 'v1')).get()?.templeBoardVersionId).toBe(board?.version.id);
  });
});
