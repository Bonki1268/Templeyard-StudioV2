import type { AppDatabase } from '../db/client.js';

export type ImportResult = { total: number; active: number };

/** 匯入寺廟資料：整批取代 temples 資料表 */
export function importTemples(_db: AppDatabase, _csvText: string): ImportResult {
  throw new Error('尚未實作');
}
