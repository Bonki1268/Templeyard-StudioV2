import type { Shot } from '@templeyard/shared';
import { describe, expect, it } from 'vitest';
import { draftFromShot, isDirty, patchFrom, percentBox } from './shotDraft';

const shot: Shot = {
  shotKey: 'k2',
  seq: 2,
  startSec: 6,
  durationSec: 8,
  shotSize: '中景',
  cameraMove: '推',
  cameraSpeed: '',
  cameraAngle: '平視',
  description: '阿嬤在廟埕',
  actionStart: '阿嬤雙手合十',
  actionEnd: '',
  viewKey: 'front_overview',
  lighting: '清晨',
  characters: ['阿嬤', '阿公'],
  dialogue: '媽祖婆保佑大家平安。',
  speaker: '阿嬤',
  subtitle: '媽祖婆保佑大家平安。',
  photoId: null,
  keyframesEnabled: false,
  keyframeTimes: [],
  customPrompt: null,
  factSources: [],
  dialogueEstimateSec: 3.3,
};

describe('細修頁的編輯狀態', () => {
  it('剛打開時沒有修改', () => {
    const draft = draftFromShot(shot);
    expect(isDirty(shot, draft)).toBe(false);
    expect(patchFrom(shot, draft)).toEqual({});
  });

  it('只送出改到的欄位', () => {
    const draft = { ...draftFromShot(shot), description: '阿嬤站在香爐旁', durationSec: 10 };
    expect(patchFrom(shot, draft)).toEqual({ description: '阿嬤站在香爐旁', durationSec: 10 });
    expect(isDirty(shot, draft)).toBe(true);
  });

  it('角色只是順序不同不算修改；多了或少了才算', () => {
    expect(patchFrom(shot, { ...draftFromShot(shot), characters: ['阿公', '阿嬤'] })).toEqual({});
    expect(patchFrom(shot, { ...draftFromShot(shot), characters: ['阿嬤'] })).toEqual({ characters: ['阿嬤'] });
  });

  it('時間點改了才算修改', () => {
    expect(patchFrom(shot, { ...draftFromShot(shot), keyframesEnabled: true, keyframeTimes: [5] })).toEqual({ keyframesEnabled: true, keyframeTimes: [5] });
  });
});

describe('圈選範圍', () => {
  it('百分比轉成比例', () => {
    expect(percentBox({ left: 10, top: 20, width: 30, height: 40 })).toEqual({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
  });
});

describe('生成設定（第 11 階段）', () => {
  it('沒有設定過的格子：使用原生語音、1 張候選圖，剛打開時沒有修改', () => {
    const draft = draftFromShot(shot);
    expect(draft).toMatchObject({ nativeVoice: true, candidateCount: 1 });
    expect(isDirty(shot, draft)).toBe(false);
  });

  it('改了生成設定：只送出改到的設定', () => {
    const draft = { ...draftFromShot(shot), nativeVoice: false, candidateCount: 3 };
    expect(patchFrom(shot, draft)).toEqual({ nativeVoice: false, candidateCount: 3 });
  });

  it('設定過的格子照它的設定', () => {
    expect(draftFromShot({ ...shot, nativeVoice: false, candidateCount: 2 })).toMatchObject({ nativeVoice: false, candidateCount: 2 });
  });
});
