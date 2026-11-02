import type { TempleRow } from '../db/schema.js';
import type { RawTempleRow } from './csv.js';

/** 依 05 的清理規則，把原始資料轉成 temples 資料表的列 */
export function cleanTemples(_rows: readonly RawTempleRow[]): TempleRow[] {
  throw new Error('尚未實作');
}
