import { MAX_TEMPLE_PHOTOS } from '@templeyard/shared';

// 照片上傳的張數規則（純函式）

/** 這次選的檔案裡，哪些可以上傳、有幾張超過上限 */
export function planUploads<T>(existingCount: number, files: readonly T[]): { accepted: T[]; skipped: number } {
  const room = Math.max(0, MAX_TEMPLE_PHOTOS - existingCount);
  const accepted = files.slice(0, room);
  return { accepted, skipped: files.length - accepted.length };
}

/** 「N / 5 張・照片會先在你的電腦上去識別」 */
export function photoCountText(count: number): string {
  return `${count} / ${MAX_TEMPLE_PHOTOS} 張・照片會先在你的電腦上去識別`;
}

/** 「每間廟最多 5 張照片，有 N 張沒有上傳」 */
export function skippedMessage(skipped: number): string {
  return `每間廟最多 ${MAX_TEMPLE_PHOTOS} 張照片，有 ${skipped} 張沒有上傳`;
}
