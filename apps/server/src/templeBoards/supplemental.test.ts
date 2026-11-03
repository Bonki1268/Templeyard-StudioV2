import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generations } from '../db/schema.js';
import { addPhoto, addVideo, createWorld, type World } from './__fixtures__/world.js';
import { TEMPLE_VIEW_NODE, TempleBoardError, createTempleBoardService, type TempleBoardService } from './service.js';

// 補充視角（F11）：方案需要、定裝版還沒有的視角，補產生並確認

let world: World;
let boards: TempleBoardService;

function consent(units = 1) {
  return world.consents.issue('v1', [{ model: 'nano-banana-pro', units }]).token;
}

async function settleAll() {
  const rows = world.db.select().from(generations).all();
  await Promise.all(rows.map((row) => world.generation.whenSettled(row.id)));
}

async function expectBoardError(run: () => unknown, status: number, message: string) {
  let caught: unknown = null;
  try {
    await run();
  } catch (error: unknown) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(TempleBoardError);
  expect(caught).toMatchObject({ status, message });
}

/** 產生並確認定裝版（廟前全景） */
async function confirmedBoard() {
  addPhoto(world, { viewKey: 'front_overview' });
  const outcome = await boards.generate('v1', { inferredViewKeys: [], consentToken: consent() });
  expect(outcome.status).toBe('accepted');
  await settleAll();
  boards.confirm('v1');
}

beforeEach(async () => {
  world = await createWorld();
  addVideo(world, { id: 'v1' });
  boards = createTempleBoardService({
    db: world.db,
    clock: world.clock,
    workflows: world.workflows,
    prompts: world.prompts,
    store: world.store,
    generation: { service: world.generation, writer: world.writer, sendAsset: world.sendAsset },
  });
  world.handlers[TEMPLE_VIEW_NODE] = boards.handleGenerated;
  await confirmedBoard();
});

afterEach(async () => {
  await world.close();
});

describe('補充視角', () => {
  it('沒有同意憑證：需要同意，不加視角', async () => {
    const outcome = await boards.addSupplementalView('v1', { viewName: '後殿' });
    expect(outcome.status).toBe('consent_required');
    expect(boards.detail('v1')?.views.map((v) => v.viewName)).toEqual(['廟前全景']);
  });

  it('同意後在這支影片的定裝版加上 AI 推測的視角，記下由這支影片補充；產生完成後等確認', async () => {
    const outcome = await boards.addSupplementalView('v1', { viewName: '後殿', consentToken: consent() });

    expect(outcome.status).toBe('accepted');
    const added = boards.detail('v1')?.views.find((v) => v.viewName === '後殿');
    expect(added).toMatchObject({ viewKey: 'custom:後殿', source: 'ai_inferred', confirmed: false, createdFromVideoId: 'v1', state: 'generating' });
    await settleAll();
    expect(boards.detail('v1')?.views.find((v) => v.viewName === '後殿')?.state).toBe('ready');
  });

  it('撰寫指令說明這是 AI 推測的視角', async () => {
    await boards.addSupplementalView('v1', { viewName: '後殿', consentToken: consent() });
    const call = world.writer.calls.find((c) => c.content.includes('視角：後殿'));
    expect(call?.content).toContain('這個視角的來源：AI 推測');
  });

  it('定裝版已經有同名的視角：409', async () => {
    await expectBoardError(() => boards.addSupplementalView('v1', { viewName: '廟前全景', consentToken: consent() }), 409, '寺廟定裝版已經有「廟前全景」');
  });

  it('確認補充的視角', async () => {
    await boards.addSupplementalView('v1', { viewName: '後殿', consentToken: consent() });
    await settleAll();

    const board = boards.confirmSupplementalView('v1', 'custom:後殿');

    expect(board.views.find((v) => v.viewName === '後殿')).toMatchObject({ confirmed: true });
    // 原本已確認的版本仍是已確認
    expect(board.version.confirmedAt).not.toBeNull();
  });

  it('還在生成中：不能確認', async () => {
    await boards.addSupplementalView('v1', { viewName: '後殿', consentToken: consent() });
    await expectBoardError(() => boards.confirmSupplementalView('v1', 'custom:後殿'), 409, '「後殿」還在生成中');
  });

  it('不是補充的視角或不存在：404', async () => {
    await expectBoardError(() => boards.confirmSupplementalView('v1', 'front_overview'), 404, '找不到這個視角');
    await expectBoardError(() => boards.confirmSupplementalView('v1', 'custom:老樹'), 404, '找不到這個視角');
  });
});
