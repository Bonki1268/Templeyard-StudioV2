import { describe, expect, it } from 'vitest';
import { keyframeControlNote, keyframeTimesError, parseKeyframeTimes, regionBoxSchema, regionText, shotPatchSchema, suggestKeyframeTimes } from './shotDetail.js';

describe('中間關鍵畫格的時間點規則（06 第 10 階段完成條件）', () => {
  it('符合規則：介於 0 秒與長度之間、彼此相隔至少 1 秒、最多 4 張', () => {
    expect(keyframeTimesError([3, 6], 10)).toBeNull();
    expect(keyframeTimesError([1, 2, 3, 4], 5)).toBeNull();
    expect(keyframeTimesError([0.5], 2)).toBeNull();
  });

  it.each([
    [[0], 10, '時間點要介於 0 秒與 10 秒之間'],
    [[10], 10, '時間點要介於 0 秒與 10 秒之間'],
    [[-1], 10, '時間點要介於 0 秒與 10 秒之間'],
    [[11], 10, '時間點要介於 0 秒與 10 秒之間'],
  ])('範圍：%o（長度 %s 秒）→ %s', (times, duration, message) => {
    expect(keyframeTimesError(times, duration)).toBe(message);
  });

  it.each([
    [[3, 3.5], '時間點彼此至少相隔 1 秒'],
    [[6, 3, 3.9], '時間點彼此至少相隔 1 秒'],
    [[4, 4], '時間點彼此至少相隔 1 秒'],
  ])('間隔：%o → %s', (times, message) => {
    expect(keyframeTimesError(times, 10)).toBe(message);
  });

  it('剛好相隔 1 秒可以', () => {
    expect(keyframeTimesError([3, 4], 10)).toBeNull();
  });

  it('最多 4 張', () => {
    expect(keyframeTimesError([2, 4, 6, 8, 9], 10)).toBe('中間關鍵畫格最多 4 張');
  });

  it('沒有時間點：開啟時至少要一個', () => {
    expect(keyframeTimesError([], 10)).toBe('請至少設定一個時間點');
  });
});

describe('時間點輸入', () => {
  it('以「、」或逗號分開，可以有小數', () => {
    expect(parseKeyframeTimes('3、6')).toEqual({ times: [3, 6] });
    expect(parseKeyframeTimes(' 2.5, 5 ')).toEqual({ times: [2.5, 5] });
    expect(parseKeyframeTimes('')).toEqual({ times: [] });
  });

  it('不是數字：說明格式', () => {
    expect(parseKeyframeTimes('三')).toEqual({ error: '時間點要是數字，以「、」分開' });
    expect(parseKeyframeTimes('3、')).toEqual({ times: [3] });
  });
});

describe('建議時間點', () => {
  it('方案已有符合規則的建議：照用', () => {
    expect(suggestKeyframeTimes({ durationSec: 10, keyframeTimes: [3, 7] })).toEqual([3, 7]);
  });

  it('沒有建議或不符合規則：取這一格的中間', () => {
    expect(suggestKeyframeTimes({ durationSec: 10, keyframeTimes: [] })).toEqual([5]);
    expect(suggestKeyframeTimes({ durationSec: 5, keyframeTimes: [0] })).toEqual([3]);
  });

  it('太短放不下（不到 2 秒）：沒有建議', () => {
    expect(suggestKeyframeTimes({ durationSec: 1, keyframeTimes: [] })).toEqual([]);
  });
});

describe('控制方式', () => {
  it.each([
    ['gemini-omni-1.1-flash', 'Gemini Omni 1.1 Flash', 'Gemini Omni 1.1 Flash：中間關鍵畫格為軟性控制'],
    ['seedance-2.0', 'Seedance 2.0', 'Seedance 2.0：中間關鍵畫格為軟性控制'],
    ['wan-2.2', 'Wan 2.2', 'Wan 2.2：中間關鍵畫格為精準控制'],
  ])('%s → %s', (key, label, note) => {
    expect(keyframeControlNote(key, label)).toBe(note);
  });
});

describe('圈選範圍', () => {
  it('寫成指令用的文字', () => {
    expect(regionText({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 })).toBe('左 10%、上 20%、寬 30%、高 40%');
  });

  it.each([
    [{ x: 0.8, y: 0, width: 0.3, height: 0.2 }, '圈選範圍要在畫面之內'],
    [{ x: -0.1, y: 0, width: 0.3, height: 0.2 }, '圈選範圍要在畫面之內'],
    [{ x: 0.1, y: 0.1, width: 0, height: 0.2 }, '圈選範圍不能是空的'],
  ])('%o → %s', (box, message) => {
    expect(regionBoxSchema.safeParse(box).error?.issues[0]?.message).toBe(message);
  });
});

describe('儲存這一格', () => {
  it('只送改到的欄位；沒有欄位時說明', () => {
    expect(shotPatchSchema.parse({ description: '阿嬤站在香爐旁' })).toEqual({ description: '阿嬤站在香爐旁' });
    expect(shotPatchSchema.safeParse({}).error?.issues[0]?.message).toBe('沒有要修改的欄位');
    expect(shotPatchSchema.safeParse({ durationSec: 0 }).error?.issues[0]?.message).toBe('每格至少 1 秒');
  });
});
