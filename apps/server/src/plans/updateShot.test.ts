import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StudioError } from '../studio/errors.js';
import { createFramesWorld, type FramesWorld } from '../frames/__fixtures__/framesWorld.js';

// 第 10 階段：細修頁儲存這一格

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

beforeEach(async () => {
  t = await createFramesWorld();
});

afterEach(async () => {
  await t.close();
});

describe('儲存這一格', () => {
  it('只改這一格，存成新的版本（手動修改），其他格不變，shotKey 不變', () => {
    const plan = t.plans.updateShot('v1', 'k2', { description: '阿嬤站在香爐旁', shotSize: '特寫' });
    expect(plan).toMatchObject({ version: 2, source: 'user_edit', diff: { summary: '改了第 2 格' } });
    expect(plan.shots[1]).toMatchObject({ shotKey: 'k2', description: '阿嬤站在香爐旁', shotSize: '特寫', characters: ['阿嬤'] });
    expect(plan.shots[0]?.description).toBe('廟前全景');
  });

  it('對話修改時記為對話修改', () => {
    expect(t.plans.updateShot('v1', 'k3', { shotSize: '特寫' }, 'chat_edit').source).toBe('chat_edit');
  });

  it('秒數變動時整支時間軸重算', () => {
    const plan = t.plans.updateShot('v1', 'k2', { durationSec: 10 });
    expect(plan.shots.map((s) => s.startSec)).toEqual([0, 6, 16, 18]);
  });

  it('細修後，這一格已確認的精緻圖標示需重新確認（06 第 10 階段完成條件）', async () => {
    await t.frames.generate('v1', t.consent(4));
    await t.settleAll();
    for (const key of ['k1', 'k2', 'k3', 'k4']) t.frames.confirm('v1', key);

    t.plans.updateShot('v1', 'k2', { description: '阿嬤站在香爐旁' });

    expect(t.frames.get('v1').shots.map((s) => s.first?.needsReconfirm)).toEqual([false, true, false, false]);
  });

  it('開啟中間關鍵畫格：時間點要符合規則', async () => {
    await expectStudioError(() => t.plans.updateShot('v1', 'k4', { keyframesEnabled: true, keyframeTimes: [3, 3.5] }), 400, '時間點彼此至少相隔 1 秒');
    await expectStudioError(() => t.plans.updateShot('v1', 'k4', { keyframesEnabled: true, keyframeTimes: [] }), 400, '請至少設定一個時間點');
    expect(t.plans.updateShot('v1', 'k4', { keyframesEnabled: true, keyframeTimes: [5] }).shots[3]).toMatchObject({ keyframesEnabled: true, keyframeTimes: [5] });
  });

  it('縮短秒數讓已設定的時間點超出範圍：400', async () => {
    t.plans.updateShot('v1', 'k4', { keyframesEnabled: true, keyframeTimes: [8] });
    await expectStudioError(() => t.plans.updateShot('v1', 'k4', { durationSec: 6 }), 400, '時間點要介於 0 秒與 6 秒之間');
  });

  it('方案沒有這一格：404', async () => {
    await expectStudioError(() => t.plans.updateShot('v1', 'nope', { description: 'x' }), 404, '方案沒有這一格');
  });
});

describe('生成設定（第 11 階段）', () => {
  it('儲存原生語音與候選圖張數，存成新的版本', () => {
    const plan = t.plans.updateShot('v1', 'k2', { nativeVoice: false, candidateCount: 3 });
    expect(plan.shots[1]).toMatchObject({ nativeVoice: false, candidateCount: 3 });
    expect(plan.version).toBe(2);
  });

  it('只改生成設定不算修改內容：已確認的精緻圖不用重新確認', async () => {
    await t.frames.generate('v1', t.consent(4));
    await t.settleAll();
    t.frames.confirm('v1', 'k2');
    t.plans.updateShot('v1', 'k2', { candidateCount: 2 });
    expect(t.frames.detail('v1', 'k2').first).toMatchObject({ selected: true, needsReconfirm: false });
  });
});
