import type { DeidBox } from '@templeyard/shared';
import { applyMasks } from './mask';

// 瀏覽器端：讀圖、在 canvas 上遮蔽、輸出去識別後的圖。全部在使用者的電腦上完成。

/** 去識別後的圖一律輸出 JPEG */
export const DEID_OUTPUT_MIME = 'image/jpeg';
const DEID_OUTPUT_QUALITY = 0.92;

export async function loadImage(source: Blob | string): Promise<HTMLImageElement> {
  const url = typeof source === 'string' ? source : URL.createObjectURL(source);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    if (typeof source !== 'string') URL.revokeObjectURL(url);
  }
}

/** 畫出原圖、把遮蔽框範圍填滿，輸出去識別後的圖 */
export async function renderDeidentified(image: HTMLImageElement, boxes: readonly DeidBox[]): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('這個瀏覽器不支援 canvas，無法去識別');
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  applyMasks(pixels, boxes);
  context.putImageData(pixels, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('輸出去識別後的照片失敗'))),
      DEID_OUTPUT_MIME,
      DEID_OUTPUT_QUALITY,
    );
  });
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('讀取照片失敗'));
    reader.readAsDataURL(blob);
  });
}
