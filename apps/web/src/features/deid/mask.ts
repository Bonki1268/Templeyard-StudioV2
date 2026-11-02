import type { DeidBox } from '@templeyard/shared';

/** 遮蔽用的實心顏色（中性灰）；用實心填滿而不是馬賽克，避免被還原 */
export const MASK_RGB = [128, 128, 128] as const;

/** 和 canvas 的 ImageData 相同的結構（RGBA） */
export type PixelBuffer = { data: Uint8ClampedArray; width: number; height: number };

/** 把未取消的遮蔽框範圍填滿遮蔽色（直接修改 image.data）；框的邊緣往外取整，不留下沒遮到的像素 */
export function applyMasks(_image: PixelBuffer, _boxes: readonly DeidBox[]): void {
  throw new Error('尚未實作');
}
