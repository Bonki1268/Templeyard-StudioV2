import { describe, expect, it } from 'vitest';
import { clipBlockers, frameShotState, generatingLabel, invalidatedBy, planChangeInvalidations, type Frame } from './frames.js';

function frame(overrides: Partial<Frame> = {}): Frame {
  return {
    id: 'f1',
    shotKey: 'a',
    kind: 'first',
    atSec: null,
    assetId: 'asset-1',
    state: 'ready',
    error: null,
    selected: false,
    needsReconfirm: false,
    createdAt: 'x',
    ...overrides,
  };
}

describe('一格精緻圖的狀態', () => {
  it.each([
    [{ first: null, last: null, needsLast: false }, 'missing'],
    [{ first: frame({ state: 'generating', assetId: null }), last: null, needsLast: false }, 'generating'],
    [{ first: frame({ state: 'failed' }), last: null, needsLast: false }, 'failed'],
    [{ first: frame(), last: null, needsLast: false }, 'pending_confirm'],
    [{ first: frame({ selected: true }), last: null, needsLast: false }, 'confirmed'],
    [{ first: frame({ selected: true, needsReconfirm: true }), last: null, needsLast: false }, 'needs_reconfirm'],
    [{ first: frame({ selected: true }), last: null, needsLast: true }, 'missing'],
    [{ first: frame({ selected: true }), last: frame({ kind: 'last' }), needsLast: true }, 'pending_confirm'],
    [{ first: frame({ selected: true }), last: frame({ kind: 'last', selected: true }), needsLast: true }, 'confirmed'],
  ] as const)('%o → %s', (shot, state) => {
    expect(frameShotState(shot)).toBe(state);
  });
});

describe('「生成影片」旁的原因', () => {
  it('列出還沒確認、需重新確認與生成中的格子', () => {
    expect(
      clipBlockers([
        { seq: 1, first: frame({ selected: true }), last: null, needsLast: false },
        { seq: 2, first: frame(), last: null, needsLast: false },
        { seq: 3, first: frame({ selected: true, needsReconfirm: true }), last: null, needsLast: false },
        { seq: 4, first: frame({ state: 'generating', assetId: null }), last: null, needsLast: false },
      ]),
    ).toEqual(['第 2 格：精緻圖還沒確認', '第 3 格：精緻圖需重新確認', '第 4 格：精緻圖還在生成中']);
  });

  it('全部確認時沒有原因，可以生成影片（第 11 階段開放）', () => {
    expect(clipBlockers([{ seq: 1, first: frame({ selected: true }), last: null, needsLast: false }])).toEqual([]);
  });

  it('需要末格的格子，末格也要確認', () => {
    expect(clipBlockers([{ seq: 1, first: frame({ selected: true }), last: frame({ id: 'f2', kind: 'last' }), needsLast: true }])).toEqual(['第 1 格：精緻圖還沒確認']);
  });

  it('沒有精緻圖的格子', () => {
    expect(clipBlockers([{ seq: 1, first: null, last: null, needsLast: false }])).toEqual(['第 1 格：還沒有精緻圖']);
  });
});

describe('生成中面板', () => {
  it('只顯示內容類型與格數', () => {
    expect(generatingLabel(4)).toBe('精緻圖・4 格');
  });
});

describe('確認失效規則（03 對照表，一列一個測試）', () => {
  const shots = [
    { shotKey: 'a', viewKey: 'front_overview', characters: [] },
    { shotKey: 'b', viewKey: 'front_overview', characters: ['阿嬤'] },
    { shotKey: 'c', viewKey: 'courtyard', characters: ['阿嬤', '阿公'] },
    { shotKey: 'd', viewKey: 'custom:後殿', characters: ['阿公'] },
  ];

  it('寺廟定裝版（新版本）→ 用到該視角的精緻圖、關鍵畫格、影片', () => {
    expect(invalidatedBy({ type: 'templeBoard', viewKeys: ['front_overview'] }, shots)).toEqual({
      frames: ['a', 'b'],
      keyframes: ['a', 'b'],
      clips: ['a', 'b'],
      final: false,
    });
  });

  it('角色定裝版 → 該角色出現的所有格的精緻圖、關鍵畫格、影片', () => {
    expect(invalidatedBy({ type: 'character', characterName: '阿嬤' }, shots)).toEqual({
      frames: ['b', 'c'],
      keyframes: ['b', 'c'],
      clips: ['b', 'c'],
      final: false,
    });
  });

  it('分鏡卡片內容、參考素材 → 該格的精緻圖、關鍵畫格、影片', () => {
    expect(invalidatedBy({ type: 'shot', shotKey: 'c', durationChanged: false }, shots)).toEqual({
      frames: ['c'],
      keyframes: ['c'],
      clips: ['c'],
      final: false,
    });
  });

  it('分鏡卡片秒數變動 → 另外成品也失效', () => {
    expect(invalidatedBy({ type: 'shot', shotKey: 'c', durationChanged: true }, shots)).toEqual({
      frames: ['c'],
      keyframes: ['c'],
      clips: ['c'],
      final: true,
    });
  });

  it('首格精緻圖 → 該格的中間關鍵畫格與影片（不含精緻圖本身）', () => {
    expect(invalidatedBy({ type: 'firstFrame', shotKey: 'b' }, shots)).toEqual({ frames: [], keyframes: ['b'], clips: ['b'], final: false });
  });

  it('任一格影片 → 成品', () => {
    expect(invalidatedBy({ type: 'clip', shotKey: 'a' }, shots)).toEqual({ frames: [], keyframes: [], clips: [], final: true });
  });

  it('沒有用到的視角或角色：沒有失效', () => {
    expect(invalidatedBy({ type: 'templeBoard', viewKeys: ['main_hall'] }, shots)).toEqual({ frames: [], keyframes: [], clips: [], final: false });
    expect(invalidatedBy({ type: 'character', characterName: '廟公' }, shots)).toEqual({ frames: [], keyframes: [], clips: [], final: false });
  });
});

describe('方案改版時的失效', () => {
  const v1 = [
    { shotKey: 'a', durationSec: 6 },
    { shotKey: 'b', durationSec: 8 },
  ];

  it('內容改了：該格失效，秒數沒變', () => {
    expect(planChangeInvalidations(v1, v1, ['b'])).toEqual([{ type: 'shot', shotKey: 'b', durationChanged: false }]);
  });

  it('秒數改了：記下秒數變動（成品也會失效）', () => {
    const v2 = [
      { shotKey: 'a', durationSec: 8 },
      { shotKey: 'b', durationSec: 6 },
    ];
    expect(planChangeInvalidations(v1, v2, ['a', 'b'])).toEqual([
      { type: 'shot', shotKey: 'a', durationChanged: true },
      { type: 'shot', shotKey: 'b', durationChanged: true },
    ]);
  });

  it('新增的格子不算（還沒有精緻圖）', () => {
    expect(planChangeInvalidations(v1, [...v1, { shotKey: 'c', durationSec: 3 }], ['c'])).toEqual([]);
  });
});
