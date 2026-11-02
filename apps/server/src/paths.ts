import path from 'node:path';
import { fileURLToPath } from 'node:url';

// repo 根目錄（apps/server/src → 上三層）
export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** 資料庫與檔案位置；DATA_DIR 為相對路徑時以 repo 根目錄為基準 */
export function resolveDataDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(repoRoot, env.DATA_DIR || 'data');
}

/** 寺廟原始資料 */
export const templesCsvPath = path.join(repoRoot, 'data', 'temples.csv');
