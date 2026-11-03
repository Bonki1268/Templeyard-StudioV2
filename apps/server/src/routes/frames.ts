import type { FastifyInstance } from 'fastify';
import type { FrameService } from '../frames/service.js';

/**
 * GET  /api/videos/:id/frames                              每格的精緻圖與生成狀態
 * POST /api/videos/:id/generate/frames                     生成所有格的精緻圖（需要同意時 409）
 * POST /api/videos/:id/shots/:shotKey/regenerate           單格重生（body：kind、consentToken）
 * POST /api/videos/:id/shots/:shotKey/frames/confirm       確認這一格的精緻圖
 * GET  /api/videos/:id/events                              SSE：精緻圖生成中、完成
 */
export function registerFrameRoutes(_app: FastifyInstance, _frames: FrameService): void {
  // 尚未實作
}
