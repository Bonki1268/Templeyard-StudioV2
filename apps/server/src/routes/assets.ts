import type { FastifyInstance } from 'fastify';
import { findAsset } from '../assets/repository.js';
import type { AssetStore } from '../assets/store.js';
import type { AppDatabase } from '../db/client.js';
import { errorBody } from '../http/notFound.js';

/** GET /api/assets/:id：讀本機檔案（後端只監聽 127.0.0.1） */
export function registerAssetRoutes(app: FastifyInstance, db: AppDatabase, store: AssetStore): void {
  app.get<{ Params: { id: string } }>('/api/assets/:id', async (request, reply) => {
    const asset = findAsset(db, request.params.id);
    if (!asset || !store.exists(asset.path)) return reply.status(404).send(errorBody('找不到這個檔案'));
    // 原圖不留在瀏覽器快取裡
    if (asset.kind === 'original_photo') void reply.header('Cache-Control', 'no-store');
    return reply.type(asset.mime).send(store.read(asset.path));
  });
}
