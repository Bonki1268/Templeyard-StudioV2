import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findAsset } from '../assets/repository.js';
import { createFfmpeg } from '../compose/ffmpeg.js';
import { generations, videos } from '../db/schema.js';
import { StudioError } from '../studio/errors.js';
import { createClipsWorld, type ClipsWorld } from './__fixtures__/clipsWorld.js';
import { MUSIC_NODE, SHOT_VIDEO_NODE, createClipService } from './service.js';

// 第 11 階段：分鏡影片、偏差比對、背景音樂、合成成品

let t: ClipsWorld;

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

function generationsOf(node: string) {
  return t.world.db
    .select()
    .from(generations)
    .all()
    .filter((row) => row.node === node);
}

/** 影片呼叫（帶 confirm: true 送出的那一次） */
function videoCalls() {
  return t.world.fake.calls.filter((c) => c.tool === 'run_template' && c.args?.confirm === true && String(c.args?.name).includes('t2v'));
}

function uploadedFile(ref: unknown): string | undefined {
  return t.world.fake.uploads.find((u) => u.ref === ref)?.filename;
}

/** 送出、等生成完成、等合成結束 */
async function generateAndCompose(consent: string | null = t.clipConsent()) {
  expect((await t.clips.generate('v1', consent)).status).toBe('accepted');
  await t.settleAll();
  await t.clips.whenComposed('v1');
}

function stage() {
  return t.world.db.select().from(videos).all().find((v) => v.id === 'v1')?.stage;
}

beforeEach(async () => {
  t = await createClipsWorld();
});

afterEach(async () => {
  await t.close();
});

describe('生成影片的檢查', () => {
  it('精緻圖還沒全部確認：409，說明第一個原因', async () => {
    await t.close();
    t = await createClipsWorld({ confirm: false });
    await expectStudioError(() => t.clips.generate('v1', t.clipConsent()), 409, '還不能生成影片：第 1 格：精緻圖還沒確認');
  });

  it('沒有同意憑證：要先同意，預估列出影片秒數與背景音樂；不留任何紀錄', async () => {
    const outcome = await t.clips.generate('v1', null);
    expect(outcome.status).toBe('consent_required');
    if (outcome.status !== 'consent_required') return;
    // 第 3 格 2 秒依模型最短 3 秒生成
    expect(outcome.check.estimate.lines.map((line) => [line.model, line.units])).toEqual([
      ['gemini-omni-1.1-flash', 27],
      ['ace-step-1.5', 1],
    ]);
    expect(generationsOf(SHOT_VIDEO_NODE)).toEqual([]);
    expect(t.clips.get('v1').shots.every((shot) => shot.clip === null)).toBe(true);
  });

  it('已經在生成：409，不重複送出', async () => {
    expect((await t.clips.generate('v1', t.clipConsent())).status).toBe('accepted');
    await expectStudioError(() => t.clips.generate('v1', t.clipConsent()), 409, '影片還在生成中');
    expect(generationsOf(SHOT_VIDEO_NODE)).toHaveLength(4);
    await t.settleAll();
    await t.clips.whenComposed('v1');
  });

  it('影片模型的首格輸入方式還沒實測：503，不送出', async () => {
    const workflows = structuredClone(t.world.workflows);
    delete workflows.models['gemini-omni-1.1-flash']?.frameInputs;
    const clips = createClipService({
      db: t.world.db,
      clock: t.world.clock,
      workflows,
      prompts: t.world.prompts,
      plans: t.plans,
      characters: t.characters,
      frames: t.frames,
      generation: { service: t.world.generation, writer: t.world.writer, sendAsset: t.world.sendAsset },
      store: t.world.store,
      ffmpeg: createFfmpeg(),
    });
    await expectStudioError(() => clips.generate('v1', t.clipConsent()), 503, 'Gemini Omni 1.1 Flash 的首格輸入方式還沒實測（07「下一輪測試」），不能生成影片');
    expect(generationsOf(SHOT_VIDEO_NODE)).toEqual([]);
  });

  it('沒有設定生成服務：503', async () => {
    const clips = createClipService({
      db: t.world.db,
      clock: t.world.clock,
      workflows: t.world.workflows,
      prompts: t.world.prompts,
      plans: t.plans,
      characters: t.characters,
      frames: t.frames,
      generation: null,
      store: t.world.store,
      ffmpeg: createFfmpeg(),
      unavailableMessage: '還沒設定生成服務',
    });
    await expectStudioError(() => clips.generate('v1', t.clipConsent()), 503, '還沒設定生成服務');
  });

  it('影片不存在：404', async () => {
    await expectStudioError(() => t.clips.get('nope'), 404, '找不到這支影片');
  });
});

describe('生成中', () => {
  it('送出後只顯示「生成中」與「影片・4 格」，影片階段是 video_generating', async () => {
    expect((await t.clips.generate('v1', t.clipConsent())).status).toBe('accepted');
    expect(t.clips.get('v1')).toMatchObject({ generating: true, generatingLabel: '影片・4 格', final: null });
    expect(stage()).toBe('video_generating');
    await t.settleAll();
    await t.clips.whenComposed('v1');
  });
});

describe('影片的生成指令與呼叫', () => {
  it('以確認的首格為第一個畫面（只上傳可以上雲的精緻圖），秒數照模型範圍', async () => {
    await generateAndCompose();
    const firstOf = (key: string) => t.frames.detail('v1', key).first?.assetId;
    const calls = videoCalls();
    expect(calls).toHaveLength(4);
    for (const key of ['k1', 'k2', 'k3', 'k4']) {
      expect(calls.some((c) => uploadedFile(c.args?.fake_first_frame) === `${firstOf(key)}.png`)).toBe(true);
    }
    // 第 3 格 2 秒 → 依模型最短長度生成 3 秒
    const k3 = calls.find((c) => uploadedFile(c.args?.fake_first_frame) === `${firstOf('k3')}.png`);
    expect(JSON.stringify(k3?.args)).toContain('A 3-second, 16:9 clip.');
    expect(generationsOf(SHOT_VIDEO_NODE).map((row) => row.estimatedCost === null || row.estimatedCost >= 0)).toEqual([true, true, true, true]);
  });

  it('撰寫請求用分鏡影片的節點：要求不要背景音樂，帶入角色的連續性鎖與台詞', async () => {
    await generateAndCompose();
    const k2 = t.world.writer.calls.find((call) => call.system.includes('圖生影片') && call.content.includes('分鏡 2，'));
    expect(k2?.system).toContain('不要背景音樂');
    expect(k2?.content).toContain('grey cotton cardigan');
    expect(k2?.content).toContain('媽祖婆保佑大家平安。');
  });

  it('關掉原生語音的格子：指令不帶台詞，說明畫面中的人不開口', async () => {
    t.plans.updateShot('v1', 'k2', { nativeVoice: false });
    t.confirmAll();
    await generateAndCompose();
    const k2 = t.world.writer.calls.find((call) => call.system.includes('圖生影片') && call.content.includes('分鏡 2，'));
    expect(k2?.content).toContain('這一格不使用原生語音：畫面中的人不開口說台詞');
    expect(k2?.content).not.toContain('媽祖婆保佑大家平安。');
  });

  it('軟性控制：關鍵畫格作為參考圖、末格作為最後一個畫面，指令依時間軸描述', async () => {
    t.plans.updateShot('v1', 'k4', { keyframesEnabled: true, keyframeTimes: [5] });
    await t.frames.generateKeyframes('v1', 'k4', t.consent(2));
    await t.settleAll();
    t.confirmAll();
    await generateAndCompose();

    const detail = t.frames.detail('v1', 'k4');
    const call = videoCalls().find((c) => uploadedFile(c.args?.fake_last_frame) === `${detail.last?.assetId}.png`);
    expect(call).toBeDefined();
    const references = ((call?.args?.fake_reference_images as unknown[] | undefined) ?? []).map(uploadedFile);
    expect(references[0]).toBe(`${detail.keyframes[0]?.assetId}.png`);
    const written = t.world.writer.calls.find((c) => c.system.includes('圖生影片') && c.content.includes('分鏡 4，'));
    expect(written?.content).toContain('0～5 秒：第 5 秒的畫面接近關鍵畫格 1；5～10 秒：停在末格');
  });

  it('背景音樂另外生成一次：長度等於成品長度、只有配樂', async () => {
    await generateAndCompose();
    const music = generationsOf(MUSIC_NODE);
    expect(music).toHaveLength(1);
    const call = t.world.fake.calls.find((c) => c.args?.confirm === true && c.args?.name === 'audio_ace_step1_5_xl_turbo');
    expect((call?.args?.input_overrides as Record<string, Record<string, unknown>>)['94']).toMatchObject({ duration: 26, lyrics: '[Instrumental]' });
  });
});

describe('合成成品', () => {
  it('全部完成後在本機合成：1920×1080、24 fps、長度等於卡片秒數總和，影片階段是 final', async () => {
    await generateAndCompose();
    const { final, generating } = t.clips.get('v1');
    expect(generating).toBe(false);
    expect(final).toMatchObject({ width: 1920, height: 1080, fps: 24, durationSec: 26, needsReconfirm: false });
    expect(findAsset(t.world.db, final?.assetId ?? '')?.kind).toBe('final');
    expect(stage()).toBe('final');
  });

  it('字幕逐字取自卡片的字幕欄，依順序；字幕檔存成資產', async () => {
    t.plans.updateShot('v1', 'k1', { subtitle: '板橋慈惠宮' });
    t.plans.updateShot('v1', 'k4', { subtitle: '阿嬤說：「來拜拜！」' });
    t.confirmAll();
    await generateAndCompose();
    const { final } = t.clips.get('v1');
    expect(final?.subtitles).toEqual(['板橋慈惠宮', '阿嬤說：「來拜拜！」']);
    expect(findAsset(t.world.db, final?.subtitleAssetId ?? '')?.kind).toBe('subtitle');
  });

  it('偏差比對：有關鍵畫格的格子記下每個時間點的相似度（0～1），沒有的格子是空的', async () => {
    t.plans.updateShot('v1', 'k4', { keyframesEnabled: true, keyframeTimes: [5] });
    await t.frames.generateKeyframes('v1', 'k4', t.consent(2));
    await t.settleAll();
    t.confirmAll();
    await generateAndCompose();
    const shots = t.clips.get('v1').shots;
    const k4 = shots.find((s) => s.shotKey === 'k4')?.clip?.similarity ?? [];
    expect(k4.map((s) => s.atSec)).toEqual([5]);
    expect(k4[0]?.score).toBeGreaterThanOrEqual(0);
    expect(k4[0]?.score).toBeLessThanOrEqual(1);
    expect(shots.find((s) => s.shotKey === 'k1')?.clip?.similarity).toEqual([]);
    expect(t.clips.clipOf('v1', 'k4')?.similarity).toEqual(k4);
  });
});

describe('失敗與重新生成', () => {
  it('有一格失敗：不合成，回到精緻圖階段；再按生成只重做失敗的那一格，背景音樂不重做', async () => {
    t.plans.updateShot('v1', 'k3', { description: '香爐 [fail]' });
    t.confirmAll();
    await generateAndCompose();
    const after = t.clips.get('v1');
    expect(after.generating).toBe(false);
    expect(after.final).toBeNull();
    expect(after.shots.find((s) => s.shotKey === 'k3')?.clip?.state).toBe('failed');
    expect(stage()).toBe('frames');

    t.plans.updateShot('v1', 'k3', { description: '香爐' });
    t.confirmAll();
    // 只重做 3 秒（93 點），在測試世界的單筆同意門檻 1000 點內，不用同意
    const videosBefore = generationsOf(SHOT_VIDEO_NODE).length;
    const retry = await t.clips.generate('v1', null);
    expect(retry.status).toBe('accepted');
    const added = generationsOf(SHOT_VIDEO_NODE).slice(videosBefore);
    expect(added).toHaveLength(1);
    expect(added[0]?.target).toMatchObject({ shotKey: 'k3' });
    expect(added[0]?.estimatedCost).toBe(93);
    expect(generationsOf(MUSIC_NODE)).toHaveLength(1);
    await t.settleAll();
    await t.clips.whenComposed('v1');
    expect(t.clips.get('v1').final).not.toBeNull();
  });
});

describe('確認失效', () => {
  it('首格換了：那一格的影片與成品標示需重新確認，其他格不受影響', async () => {
    await generateAndCompose();
    await t.frames.regenerate('v1', 'k2', 'first', t.consent(1));
    await t.settleAll();
    const { shots, final } = t.clips.get('v1');
    expect(shots.find((s) => s.shotKey === 'k2')?.clip?.needsReconfirm).toBe(true);
    expect(shots.find((s) => s.shotKey === 'k1')?.clip?.needsReconfirm).toBe(false);
    expect(final?.needsReconfirm).toBe(true);
  });

  it('角色改了：這個角色出現的格子的影片標示需重新確認', async () => {
    await generateAndCompose();
    // 失效規則比對方案裡的角色名稱
    t.clips.invalidate('v1', { type: 'character', characterName: '阿嬤' });
    const { shots } = t.clips.get('v1');
    expect(shots.filter((s) => s.clip?.needsReconfirm).map((s) => s.shotKey)).toEqual(['k2', 'k4']);
  });

  it('再按生成只重做需重新確認的格子，完成後重新合成', async () => {
    await generateAndCompose();
    const before = t.clips.get('v1').final?.id;
    t.clips.invalidate('v1', { type: 'shot', shotKey: 'k1', durationChanged: false });
    // 只重做第 1 格 6 秒（186 點），在單筆同意門檻 1000 點內，不用同意；背景音樂不重做
    const videosBefore = generationsOf(SHOT_VIDEO_NODE).length;
    await generateAndCompose(null);
    const added = generationsOf(SHOT_VIDEO_NODE).slice(videosBefore);
    expect(added.map((row) => row.target.shotKey)).toEqual(['k1']);
    expect(added[0]?.estimatedCost).toBe(186);
    expect(generationsOf(MUSIC_NODE)).toHaveLength(1);
    const after = t.clips.get('v1');
    expect(after.final?.id).not.toBe(before);
    expect(after.final?.needsReconfirm).toBe(false);
  });
});
