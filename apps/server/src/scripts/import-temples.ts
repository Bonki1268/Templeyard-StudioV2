// 手動重新匯入寺廟資料：pnpm db:import
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { openDatabase } from '../db/client.js';
import { resolveDataDir, templesCsvPath } from '../paths.js';
import { importTemples } from '../temples/import.js';

const dataDir = resolveDataDir();
mkdirSync(dataDir, { recursive: true });
const db = openDatabase(path.join(dataDir, 'app.db'));
const result = importTemples(db, readFileSync(templesCsvPath, 'utf8'));
console.log(`已匯入寺廟資料：共 ${result.total} 筆，有效 ${result.active} 間`);
