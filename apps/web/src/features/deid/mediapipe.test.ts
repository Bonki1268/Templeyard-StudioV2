import { describe, expect, it } from 'vitest';
import { toDetectedFaces } from './mediapipe';

describe('MediaPipe 的偵測結果換成比例框', () => {
  it('像素框換成比例，每邊往外多遮 15%', () => {
    const [face] = toDetectedFaces([{ boundingBox: { originX: 100, originY: 50, width: 40, height: 60 } }], 400, 300);

    // 寬 40 → 每邊多 6；高 60 → 每邊多 9
    expect(face?.x).toBeCloseTo(94 / 400);
    expect(face?.y).toBeCloseTo(41 / 300);
    expect(face?.width).toBeCloseTo(52 / 400);
    expect(face?.height).toBeCloseTo(78 / 300);
  });

  it('貼近邊緣時限制在照片範圍內', () => {
    const [face] = toDetectedFaces([{ boundingBox: { originX: 0, originY: 280, width: 40, height: 20 } }], 400, 300, 0.5);

    expect(face?.x).toBe(0);
    expect((face?.y ?? 0) + (face?.height ?? 0)).toBeCloseTo(1);
    expect(face?.width).toBeCloseTo(60 / 400);
  });

  it('沒有框的結果略過', () => {
    expect(toDetectedFaces([{}, { boundingBox: undefined }], 400, 300)).toEqual([]);
  });

  it('padding 為 0 時就是原本的框', () => {
    expect(toDetectedFaces([{ boundingBox: { originX: 40, originY: 30, width: 80, height: 60 } }], 400, 300, 0)).toEqual([
      { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
    ]);
  });
});
