import type { DeidBox } from '@templeyard/shared';

// 瀏覽器端：讀圖、在 canvas 上遮蔽、輸出去識別後的圖。全部在使用者的電腦上完成。

/** 去識別後的圖一律輸出 JPEG */
export const DEID_OUTPUT_MIME = 'image/jpeg';
const DEID_OUTPUT_QUALITY = 0.92;

export function loadImage(_source: Blob | string): Promise<HTMLImageElement> {
  throw new Error('尚未實作');
}

export function renderDeidentified(_image: HTMLImageElement, _boxes: readonly DeidBox[]): Promise<Blob> {
  void DEID_OUTPUT_QUALITY;
  throw new Error('尚未實作');
}

export function blobToBase64(_blob: Blob): Promise<string> {
  throw new Error('尚未實作');
}
