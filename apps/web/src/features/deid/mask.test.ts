import type { DeidBox } from '@templeyard/shared';
import { describe, expect, it } from 'vitest';
import { MASK_RGB, applyMasks, type PixelBuffer } from './mask';

// 10×10、每個像素都是 (200, 60, 40) 的圖
function solidImage(width = 10, height = 10): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([200, 60, 40, 255], i);
  return { data, width, height };
}

function pixel(image: PixelBuffer, x: number, y: number): number[] {
  const offset = (y * image.width + x) * 4;
  return [...image.data.slice(offset, offset + 4)];
}

const box = (extra: Partial<DeidBox>): DeidBox => ({
  id: 'b',
  kind: 'face',
  source: 'auto',
  x: 0.2,
  y: 0.2,
  width: 0.3,
  height: 0.3,
  cancelled: false,
  ...extra,
});

describe('在像素上遮蔽', () => {
  it('框內填滿遮蔽色、框外不變', () => {
    const image = solidImage();

    applyMasks(image, [box({})]);

    expect(pixel(image, 3, 3)).toEqual([...MASK_RGB, 255]);
    expect(pixel(image, 2, 2)).toEqual([...MASK_RGB, 255]);
    expect(pixel(image, 4, 4)).toEqual([...MASK_RGB, 255]);
    expect(pixel(image, 5, 5)).toEqual([200, 60, 40, 255]);
    expect(pixel(image, 1, 1)).toEqual([200, 60, 40, 255]);
  });

  it('框的邊緣不在整數像素上時往外取整，不留下沒遮到的像素', () => {
    const image = solidImage();

    applyMasks(image, [box({ x: 0.25, y: 0.25, width: 0.1, height: 0.1 })]);

    // 0.25×10 = 2.5 → 從第 2 格開始；0.35×10 = 3.5 → 到第 3 格
    expect(pixel(image, 2, 2)).toEqual([...MASK_RGB, 255]);
    expect(pixel(image, 3, 3)).toEqual([...MASK_RGB, 255]);
    expect(pixel(image, 4, 4)).toEqual([200, 60, 40, 255]);
  });

  it('已取消的框不遮蔽', () => {
    const image = solidImage();

    applyMasks(image, [box({ cancelled: true })]);

    expect(pixel(image, 3, 3)).toEqual([200, 60, 40, 255]);
  });

  it('貼齊右下角的框遮到最後一個像素，不會寫出範圍', () => {
    const image = solidImage();

    applyMasks(image, [box({ x: 0.8, y: 0.8, width: 0.2, height: 0.2 })]);

    expect(pixel(image, 9, 9)).toEqual([...MASK_RGB, 255]);
    expect(image.data.length).toBe(10 * 10 * 4);
  });
});
