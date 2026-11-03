import type { Shot, ShotInput } from '@templeyard/shared';
import { describe, expect, it } from 'vitest';
import { addShot, duplicateShot, moveShot, removeShot, toInputs, withDurations } from './planEditor';

const input = (shotKey: string, durationSec: number): ShotInput => ({ shotKey, durationSec, shotSize: '中景', description: shotKey });

describe('送出用的卡片', () => {
  it('保留 shotKey 與內容，去掉序號、開始秒數與對白估時', () => {
    const shot: Shot = {
      shotKey: 'a',
      seq: 1,
      startSec: 0,
      durationSec: 6,
      shotSize: '遠景',
      cameraMove: '固定',
      cameraSpeed: '',
      cameraAngle: '',
      description: '廟前全景',
      actionStart: '',
      actionEnd: '',
      viewKey: 'front_overview',
      lighting: '',
      characters: ['阿嬤'],
      dialogue: '平安',
      speaker: '阿嬤',
      subtitle: '平安',
      photoId: null,
      keyframesEnabled: false,
      keyframeTimes: [],
      customPrompt: null,
      factSources: [],
      dialogueEstimateSec: 1.5,
    };
    const [converted] = toInputs([shot]);
    expect(converted).toMatchObject({ shotKey: 'a', durationSec: 6, shotSize: '遠景', description: '廟前全景', characters: ['阿嬤'], dialogue: '平安' });
    expect(converted).not.toHaveProperty('seq');
    expect(converted).not.toHaveProperty('startSec');
    expect(converted).not.toHaveProperty('dialogueEstimateSec');
  });
});

describe('調整卡片', () => {
  const shots = [input('a', 6), input('b', 8), input('c', 2)];

  it('移動：第 1 格往下移一格', () => {
    expect(moveShot(shots, 0, 1).map((s) => s.shotKey)).toEqual(['b', 'a', 'c']);
  });

  it('拖曳：第 3 格拖到第 1 格的位置', () => {
    expect(moveShot(shots, 2, 0).map((s) => s.shotKey)).toEqual(['c', 'a', 'b']);
  });

  it('超出範圍不改動', () => {
    expect(moveShot(shots, 0, -1).map((s) => s.shotKey)).toEqual(['a', 'b', 'c']);
    expect(moveShot(shots, 2, 3).map((s) => s.shotKey)).toEqual(['a', 'b', 'c']);
  });

  it('複製：放在後面，是新的一格（沒有 shotKey），內容相同', () => {
    const copied = duplicateShot(shots, 1);
    expect(copied).toHaveLength(4);
    expect(copied[2]).toEqual({ durationSec: 8, shotSize: '中景', description: 'b' });
  });

  it('刪除；只剩一格時不刪', () => {
    expect(removeShot(shots, 1).map((s) => s.shotKey)).toEqual(['a', 'c']);
    expect(removeShot([input('a', 6)], 0)).toHaveLength(1);
  });

  it('新增：最後多一格 3 秒中景', () => {
    const added = addShot(shots);
    expect(added).toHaveLength(4);
    expect(added[3]).toEqual({ durationSec: 3, shotSize: '中景', cameraMove: '固定', description: '', viewKey: '', dialogue: '', subtitle: '' });
  });

  it('換掉秒數', () => {
    expect(withDurations(shots, [8, 6, 2]).map((s) => s.durationSec)).toEqual([8, 6, 2]);
  });
});
