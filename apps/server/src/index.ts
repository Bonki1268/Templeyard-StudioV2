import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { buildApp } from './app.js';
import { openDatabase } from './db/client.js';
import { resolveDataDir, templesCsvPath } from './paths.js';
import { importTemples } from './temples/import.js';
import { countTemples } from './temples/repository.js';

const port = Number(process.env.API_PORT ?? 3001);
const dataDir = resolveDataDir();
mkdirSync(dataDir, { recursive: true });
const db = openDatabase(path.join(dataDir, 'app.db'));

// 第一次啟動時自動匯入寺廟資料；失敗時仍啟動後端，只是寺廟搜尋沒有資料
try {
  if (countTemples(db) === 0) {
    const result = importTemples(db, readFileSync(templesCsvPath, 'utf8'));
    console.log(`已匯入寺廟資料：共 ${result.total} 筆，有效 ${result.active} 間`);
  }
} catch (error: unknown) {
  console.error('寺廟資料匯入失敗，請執行 pnpm db:import 重試', error);
}

const app = buildApp({ db, assetsDir: path.join(dataDir, 'assets') });

app.listen({ port, host: '127.0.0.1' }).then(
  () => {
    console.log(`廟埕影室後端已啟動：http://127.0.0.1:${port}`);
  },
  (error: unknown) => {
    console.error('後端啟動失敗', error);
    process.exit(1);
  },
);
