import type { FastifyInstance } from 'fastify';
import type { AssetStore } from '../assets/store.js';
import type { AppDatabase } from '../db/client.js';
import type { Clock } from '../series/repository.js';

/**
 * POST /api/videos/:id/photos/originals：原圖，只存本機（cloud_ok = 0）
 * POST /api/videos/:id/photos：去識別後的照片
 * PATCH /api/videos/:id/photos/:photoId：改視角或重新遮蔽
 */
export function registerPhotoRoutes(_app: FastifyInstance, _db: AppDatabase, _clock: Clock, _store: AssetStore): void {
  throw new Error('尚未實作');
}
