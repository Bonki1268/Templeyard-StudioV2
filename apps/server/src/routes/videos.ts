import type { FastifyInstance } from 'fastify';
import type { AppDatabase } from '../db/client.js';
import type { Clock } from '../series/repository.js';

/** POST /api/videos、GET /api/videos/:id、PATCH /api/videos/:id */
export function registerVideoRoutes(_app: FastifyInstance, _db: AppDatabase, _clock: Clock): void {
  throw new Error('尚未實作');
}
