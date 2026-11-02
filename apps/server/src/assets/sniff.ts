import type { PhotoMime } from '@templeyard/shared';

/** 依檔頭判斷圖片格式；不是 JPEG、PNG、WebP 時回傳 null */
export function sniffImageMime(_bytes: Uint8Array): PhotoMime | null {
  throw new Error('尚未實作');
}
