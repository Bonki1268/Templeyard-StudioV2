import type { FastifyInstance } from 'fastify';
import type { TempleBoardService } from '../templeBoards/service.js';

/**
 * GET   /api/videos/:id/temple-board
 * POST  /api/videos/:id/temple-board/generate            需要同意時 409，附上 check
 * POST  /api/videos/:id/temple-board/views/:viewKey/regenerate
 * POST  /api/videos/:id/temple-board/views/:viewKey/confirm
 * PATCH /api/videos/:id/temple-board                     外觀規範與光線
 * POST  /api/videos/:id/temple-board/confirm
 * POST  /api/videos/:id/temple-board/reuse
 * POST  /api/videos/:id/temple-board/versions            另存新版本
 */
export function registerTempleBoardRoutes(_app: FastifyInstance, _boards: TempleBoardService): void {
  // 第 5 階段綠燈實作
}
