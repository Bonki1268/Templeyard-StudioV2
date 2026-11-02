import type { AppDatabase } from '../db/client.js';
import { temples } from '../db/schema.js';
import { cleanTemples } from './clean.js';
import { parseTemplesCsv } from './csv.js';

export type ImportResult = { total: number; active: number };

// SQLite 單一語句的參數有上限，分批寫入
const BATCH_SIZE = 50;

/** 匯入寺廟資料：在同一個交易裡整批取代 temples 資料表 */
export function importTemples(db: AppDatabase, csvText: string): ImportResult {
  const rows = cleanTemples(parseTemplesCsv(csvText));

  db.transaction((tx) => {
    tx.delete(temples).run();
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      tx.insert(temples).values(rows.slice(i, i + BATCH_SIZE)).run();
    }
  });

  return {
    total: rows.length,
    active: rows.filter((row) => row.status === 'active').length,
  };
}
