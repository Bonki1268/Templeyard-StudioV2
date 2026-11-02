import type { FastifyInstance } from 'fastify';
import type { AppDatabase } from '../db/client.js';
import type { Clock } from '../series/repository.js';

/** GET /api/series、POST /api/series、PATCH /api/series/:id */
export function registerSeriesRoutes(_app: FastifyInstance, _db: AppDatabase, _clock: Clock): void {
  // 尚未實作
}
