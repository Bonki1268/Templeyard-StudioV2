import type { DeidBox } from '@templeyard/shared';
import { activeBoxes } from './boxes';

/** 遮蔽用的實心顏色（中性灰）；用實心填滿而不是馬賽克，避免被還原 */
export const MASK_RGB = [128, 128, 128] as const;

/** 和 canvas 的 ImageData 相同的結構（RGBA） */
export type PixelBuffer = { data: Uint8ClampedArray; width: number; height: number };

/** 把未取消的遮蔽框範圍填滿遮蔽色（直接修改 image.data）；框的邊緣往外取整，不留下沒遮到的像素 */
export function applyMasks(image: PixelBuffer, boxes: readonly DeidBox[]): void {
  const { data, width, height } = image;
  for (const box of activeBoxes(boxes)) {
    const left = Math.max(0, Math.floor(box.x * width));
    const top = Math.max(0, Math.floor(box.y * height));
    const right = Math.min(width, Math.ceil((box.x + box.width) * width));
    const bottom = Math.min(height, Math.ceil((box.y + box.height) * height));
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const offset = (y * width + x) * 4;
        data[offset] = MASK_RGB[0];
        data[offset + 1] = MASK_RGB[1];
        data[offset + 2] = MASK_RGB[2];
        data[offset + 3] = 255;
      }
    }
  }
}
