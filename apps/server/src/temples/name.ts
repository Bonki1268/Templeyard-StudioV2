import type { TempleFlag, TempleStatus } from '@templeyard/shared';

const ABOLISHED_NOTE = '(已廢止)';
const UNREGISTERED_NOTE = '(尚未取得正式寺廟登記證)';
const FOUNDATION_PREFIX = '財團法人';
// 「財團法人」之後的地區前綴（「臺」已轉「台」）
const FOUNDATION_REGION_PREFIX = /^財團法人(?:新北市|台灣省台北縣)?/u;

/** 全形轉半形、「臺」轉「台」、去掉前後空白；搜尋時廟名以外的欄位也用它 */
export function canonicalize(text: string): string {
  return text.normalize('NFKC').replace(/臺/gu, '台').trim();
}

/** 搜尋用名稱：「臺」轉「台」、去掉財團法人前綴與狀態註記 */
export function normalizeTempleName(name: string): string {
  return canonicalize(name)
    .replace(FOUNDATION_REGION_PREFIX, '')
    .replace(ABOLISHED_NOTE, '')
    .replace(UNREGISTERED_NOTE, '')
    .trim();
}

/** 從登記名稱讀出財團法人、已廢止、未取得登記證（重名由整批資料判斷） */
export function parseNameFlags(name: string): TempleFlag[] {
  const text = canonicalize(name);
  const flags: TempleFlag[] = [];
  if (text.startsWith(FOUNDATION_PREFIX)) flags.push('foundation');
  if (text.includes(ABOLISHED_NOTE)) flags.push('abolished');
  if (text.includes(UNREGISTERED_NOTE)) flags.push('unregistered');
  return flags;
}

/** 由標記決定狀態 */
export function statusFromFlags(flags: readonly TempleFlag[]): TempleStatus {
  if (flags.includes('abolished')) return 'abolished';
  if (flags.includes('unregistered')) return 'unregistered';
  return 'active';
}
