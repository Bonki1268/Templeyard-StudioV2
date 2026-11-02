import type { TempleFlag, TempleStatus } from '@templeyard/shared';

/** 搜尋用名稱：「臺」轉「台」、去掉財團法人前綴與狀態註記 */
export function normalizeTempleName(_name: string): string {
  throw new Error('尚未實作');
}

/** 從登記名稱讀出財團法人、已廢止、未取得登記證（重名由整批資料判斷） */
export function parseNameFlags(_name: string): TempleFlag[] {
  throw new Error('尚未實作');
}

/** 由標記決定狀態 */
export function statusFromFlags(_flags: readonly TempleFlag[]): TempleStatus {
  throw new Error('尚未實作');
}
