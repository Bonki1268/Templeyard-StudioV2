import { regionEditSchema, uploadFrameSchema, type PromptFile } from '@templeyard/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FAKE_PNG } from '../../../../tests/fakes/comfy-mcp/server.js';
import { findAsset } from '../assets/repository.js';
import { generations } from '../db/schema.js';
import { StudioError } from '../studio/errors.js';
import { createFramesWorld, type FramesWorld } from './__fixtures__/framesWorld.js';
import { KEYFRAME_NODE, REFINED_FRAME_NODE, REGION_EDIT_NODE } from './service.js';

// 第 10 階段：細修頁、上傳自己的首格、選回舊版、自訂指令、中間關鍵畫格、限定範圍修改

let t: FramesWorld;

async function expectStudioError(run: () => unknown, status: number, message: string) {
  let caught: unknown = null;
  try {
    await run();
  } catch (error: unknown) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(StudioError);
  expect(caught).toMatchObject({ status, message });
}

async function generatedFrames() {
  expect((await t.frames.generate('v1', t.consent(4))).status).toBe('accepted');
  await t.settleAll();
}

function generationsOf(node: string) {
  return t.world.db
    .select()
    .from(generations)
    .all()
    .filter((row) => row.node === node);
}

beforeEach(async () => {
  t = await createFramesWorld();
});

afterEach(async () => {
  await t.close();
});

describe('細修頁的資料', () => {
  it('還沒生成：這一格的卡片、沒有圖、控制方式、總長度', () => {
    const detail = t.frames.detail('v1', 'k2');
    expect(detail).toMatchObject({
      shot: { shotKey: 'k2', seq: 2, durationSec: 8 },
      first: null,
      last: null,
      keyframes: [],
      versions: [],
      lastPrompt: null,
      keyframeControl: 'Gemini Omni 1.1 Flash：中間關鍵畫格為軟性控制',
      totalSec: 26,
      targetSec: 30,
    });
  });

  it('生成後：目前的首格與最近一次的生成指令', async () => {
    await generatedFrames();
    const detail = t.frames.detail('v1', 'k2');
    expect(detail.first?.state).toBe('ready');
    expect(detail.versions).toHaveLength(1);
    expect(detail.lastPrompt).toContain('分鏡 2，首格');
  });

  it('方案沒有這一格：404', async () => {
    await expectStudioError(() => t.frames.detail('v1', 'nope'), 404, '方案沒有這一格');
  });
});

describe('上傳自己的首格', () => {
  it('瀏覽器去識別後的圖存成可以上雲的精緻圖，標示使用者上傳，成為目前的首格', async () => {
    await generatedFrames();
    const detail = t.frames.upload('v1', 'k1', uploadFrameSchema.parse({ kind: 'first', mime: 'image/png', dataBase64: FAKE_PNG.toString('base64') }));
    expect(detail.first).toMatchObject({ state: 'ready', selected: false });
    const uploaded = detail.versions.at(-1);
    expect(uploaded).toMatchObject({ userUploaded: true, kind: 'first' });
    const asset = findAsset(t.world.db, uploaded?.assetId ?? '');
    expect(asset).toMatchObject({ kind: 'frame', cloudOk: true });
  });

  it('上傳後這一格要重新確認', async () => {
    await generatedFrames();
    t.frames.confirm('v1', 'k1');
    const detail = t.frames.upload('v1', 'k1', uploadFrameSchema.parse({ kind: 'first', mime: 'image/png', dataBase64: FAKE_PNG.toString('base64') }));
    expect(detail.first?.selected).toBe(false);
  });
});

describe('版本：選回舊的', () => {
  it('重生後新的一張是目前的；選回舊的那張後它變回目前的', async () => {
    await generatedFrames();
    const old = t.frames.detail('v1', 'k2').first?.id;
    await t.frames.regenerate('v1', 'k2', 'first', t.consent(1));
    await t.settleAll();
    expect(t.frames.detail('v1', 'k2').first?.id).not.toBe(old);

    const detail = t.frames.select('v1', 'k2', old ?? '');

    expect(detail.first?.id).toBe(old);
    expect(detail.versions).toHaveLength(2);
  });

  it('不是這一格的圖：404', async () => {
    await generatedFrames();
    const other = t.frames.detail('v1', 'k1').first?.id ?? '';
    await expectStudioError(() => t.frames.select('v1', 'k2', other), 404, '找不到這張精緻圖');
  });
});

describe('自訂指令（06 第 10 階段完成條件）', () => {
  it('這一格有自訂指令時照它送出，不經撰寫者', async () => {
    await generatedFrames();
    t.plans.updateShot('v1', 'k1', { customPrompt: 'A quiet temple front at dawn, custom prompt for shot one' });
    const writes = t.world.writer.calls.length;

    await t.frames.regenerate('v1', 'k1', 'first', t.consent(1));
    await t.settleAll();

    expect(generationsOf(REFINED_FRAME_NODE).at(-1)?.input.prompt).toBe('A quiet temple front at dawn, custom prompt for shot one');
    expect(t.world.writer.calls).toHaveLength(writes);
  });

  it('節點的生成指令更新後，自訂指令不被覆蓋', async () => {
    await generatedFrames();
    t.plans.updateShot('v1', 'k1', { customPrompt: 'Custom prompt survives node updates' });
    const original = t.world.prompts.get(REFINED_FRAME_NODE);
    if (!original) throw new Error('沒有 refined-frame');
    const updated: PromptFile = { ...original, version: original.version + 1, system: `${original.system}\n（更新後的節點指令）` };
    const newer = t.framesWith(new Map([...t.world.prompts, [REFINED_FRAME_NODE, updated]]));

    await newer.regenerate('v1', 'k1', 'first', t.consent(1));
    await t.settleAll();

    expect(generationsOf(REFINED_FRAME_NODE).at(-1)?.input.prompt).toBe('Custom prompt survives node updates');
    expect(t.frames.detail('v1', 'k1').shot.customPrompt).toBe('Custom prompt survives node updates');
  });
});

describe('中間關鍵畫格', () => {
  it('還沒開啟：409', async () => {
    await expectStudioError(() => t.frames.generateKeyframes('v1', 'k4', t.consent(1)), 409, '這一格還沒開啟中間關鍵畫格');
  });

  it('開啟後產生每個時間點的關鍵畫格，還沒有末格時一併產生（同意 3 張）', async () => {
    await generatedFrames();
    t.plans.updateShot('v1', 'k4', { keyframesEnabled: true, keyframeTimes: [3, 6] });
    expect((await t.frames.generateKeyframes('v1', 'k4', t.consent(2))).status).toBe('consent_required');

    expect((await t.frames.generateKeyframes('v1', 'k4', t.consent(3))).status).toBe('accepted');
    await t.settleAll();

    const detail = t.frames.detail('v1', 'k4');
    expect(detail.keyframes.map((k) => [k.atSec, k.state])).toEqual([
      [3, 'ready'],
      [6, 'ready'],
    ]);
    expect(detail.last?.state).toBe('ready');
  });

  it('關鍵畫格的撰寫內容只寫該時間點，帶入角色的連續性鎖', async () => {
    await generatedFrames();
    t.plans.updateShot('v1', 'k4', { keyframesEnabled: true, keyframeTimes: [5] });
    await t.frames.generateKeyframes('v1', 'k4', t.consent(2));
    await t.settleAll();
    const prompt = String(generationsOf(KEYFRAME_NODE)[0]?.input.prompt);
    expect(prompt).toContain('第 5 秒');
    expect(prompt).toContain('grey cotton cardigan');
  });
});

describe('限定範圍修改', () => {
  it('以這張圖為參考、只改圈選的一處，產生新的一張並記下修改自哪一張', async () => {
    await generatedFrames();
    const source = t.frames.detail('v1', 'k1').first;
    const input = regionEditSchema.parse({ box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }, instruction: '把香爐換成銅製的' });

    expect((await t.frames.editRegion('v1', 'k1', source?.id ?? '', input)).status).toBe('consent_required');
    expect((await t.frames.editRegion('v1', 'k1', source?.id ?? '', { ...input, consentToken: t.consent(1) })).status).toBe('accepted');
    await t.settleAll();

    const detail = t.frames.detail('v1', 'k1');
    expect(detail.versions.at(-1)).toMatchObject({ editOfFrameId: source?.id, kind: 'first' });
    expect(detail.first?.id).toBe(detail.versions.at(-1)?.id);
    const row = generationsOf(REGION_EDIT_NODE)[0];
    expect(String(row?.input.prompt)).toContain('把香爐換成銅製的');
    expect(String(row?.input.prompt)).toContain('左 10%、上 20%、寬 30%、高 40%');
    expect(t.world.fake.uploads.map((u) => u.filename)).toContain(`${source?.assetId}.png`);
  });

  it('這張圖不是這一格的：404', async () => {
    await generatedFrames();
    const other = t.frames.detail('v1', 'k2').first?.id ?? '';
    const input = regionEditSchema.parse({ box: { x: 0, y: 0, width: 0.5, height: 0.5 }, instruction: '改一下', consentToken: t.consent(1) });
    await expectStudioError(() => t.frames.editRegion('v1', 'k1', other, input), 404, '找不到這張精緻圖');
  });
});

// ── 第 11 階段：第 10 階段稽核補上的規則與生成設定 ──

describe('上傳自己的末格', () => {
  it('上傳成為這一格目前的末格，標示使用者上傳', async () => {
    await generatedFrames();
    const detail = t.frames.upload('v1', 'k1', uploadFrameSchema.parse({ kind: 'last', mime: 'image/png', dataBase64: FAKE_PNG.toString('base64') }));
    expect(detail.last).toMatchObject({ kind: 'last', state: 'ready' });
    expect(detail.versions.find((v) => v.id === detail.last?.id)?.userUploaded).toBe(true);
  });
});

describe('關鍵畫格的確認失效（03 第 162、163 行）', () => {
  async function withKeyframe() {
    await generatedFrames();
    t.plans.updateShot('v1', 'k4', { keyframesEnabled: true, keyframeTimes: [5] });
    await t.frames.generateKeyframes('v1', 'k4', t.consent(2));
    await t.settleAll();
    expect(t.frames.detail('v1', 'k4').keyframes[0]?.needsReconfirm).toBe(false);
  }

  it('卡片內容改了：這一格的關鍵畫格要重新確認', async () => {
    await withKeyframe();
    t.plans.updateShot('v1', 'k4', { description: '阿嬤慢慢走進廟裡' });
    expect(t.frames.detail('v1', 'k4').keyframes[0]?.needsReconfirm).toBe(true);
  });

  it('首格換了（重生完成）：這一格的關鍵畫格要重新確認，其他格不受影響', async () => {
    await withKeyframe();
    await t.frames.regenerate('v1', 'k4', 'first', t.consent(1));
    await t.settleAll();
    expect(t.frames.detail('v1', 'k4').keyframes[0]?.needsReconfirm).toBe(true);
    expect(t.frames.detail('v1', 'k2').first?.needsReconfirm).toBe(false);
  });

  it('首格換了時通知影片服務（firstFrame）；選回舊的首格也算', async () => {
    const changes: unknown[] = [];
    t.onFrameChange.push((_videoId, change) => changes.push(change));
    await generatedFrames();
    changes.length = 0;
    await t.frames.regenerate('v1', 'k2', 'first', t.consent(1));
    await t.settleAll();
    expect(changes).toContainEqual({ type: 'firstFrame', shotKey: 'k2' });
    changes.length = 0;
    const old = t.frames.detail('v1', 'k2').versions[0]?.id ?? '';
    t.frames.select('v1', 'k2', old);
    expect(changes).toContainEqual({ type: 'firstFrame', shotKey: 'k2' });
  });

  it('方案改版的失效也轉給影片服務', async () => {
    const changes: unknown[] = [];
    t.onFrameChange.push((_videoId, change) => changes.push(change));
    await generatedFrames();
    t.plans.updateShot('v1', 'k1', { durationSec: 5 });
    expect(changes).toContainEqual({ type: 'shot', shotKey: 'k1', durationChanged: true });
  });
});

describe('生成設定：一次產生幾張候選圖', () => {
  it('重生這一格產生設定的張數（同意的張數要夠）', async () => {
    await generatedFrames();
    t.plans.updateShot('v1', 'k2', { candidateCount: 3 });
    expect((await t.frames.regenerate('v1', 'k2', 'first', t.consent(1))).status).toBe('consent_required');
    expect((await t.frames.regenerate('v1', 'k2', 'first', t.consent(3))).status).toBe('accepted');
    await t.settleAll();
    expect(t.frames.detail('v1', 'k2').versions.filter((v) => v.kind === 'first')).toHaveLength(4);
  });

  it('生成所有格時，每格的首格也照各自的張數', async () => {
    t.plans.updateShot('v1', 'k1', { candidateCount: 2 });
    expect((await t.frames.generate('v1', t.consent(4))).status).toBe('consent_required');
    expect((await t.frames.generate('v1', t.consent(5))).status).toBe('accepted');
    await t.settleAll();
    expect(t.frames.detail('v1', 'k1').versions.filter((v) => v.kind === 'first')).toHaveLength(2);
  });
});

describe('細修頁的影片', () => {
  it('這一格有影片時一併回傳（偏差比對用），沒有時是 null', async () => {
    expect(t.frames.detail('v1', 'k2').clip).toBeNull();
    t.clipLookup.current = (_videoId, shotKey) =>
      shotKey === 'k2'
        ? { id: 'c1', shotKey: 'k2', assetId: 'a1', state: 'ready', error: null, selected: false, needsReconfirm: false, similarity: [{ atSec: 4, score: 0.8 }], createdAt: 'x' }
        : null;
    expect(t.frames.detail('v1', 'k2').clip?.similarity).toEqual([{ atSec: 4, score: 0.8 }]);
  });
});
