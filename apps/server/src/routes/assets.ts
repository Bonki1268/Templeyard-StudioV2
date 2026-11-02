import type { FastifyInstance } from 'fastify';
import type { AssetStore } from '../assets/store.js';
import type { AppDatabase } from '../db/client.js';

/** GET /api/assets/:id：讀本機檔案（後端只監聽 127.0.0.1） */
export function registerAssetRoutes(_app: FastifyInstance, _db: AppDatabase, _store: AssetStore): void {
  throw new Error('尚未實作');
}
