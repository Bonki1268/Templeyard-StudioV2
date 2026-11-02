// 照片上傳的張數規則（純函式）

/** 這次選的檔案裡，哪些可以上傳、有幾張超過上限 */
export function planUploads<T>(_existingCount: number, _files: readonly T[]): { accepted: T[]; skipped: number } {
  throw new Error('尚未實作');
}

/** 「N / 5 張・照片會先在你的電腦上去識別」 */
export function photoCountText(_count: number): string {
  throw new Error('尚未實作');
}

/** 「每間廟最多 5 張照片，有 N 張沒有上傳」 */
export function skippedMessage(_skipped: number): string {
  throw new Error('尚未實作');
}
