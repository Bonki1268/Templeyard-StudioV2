import type { FastifyInstance } from 'fastify';
import type { PlanService } from '../plans/service.js';

/**
 * GET  /api/videos/:id/plan                      現行方案、版本清單、檢查規則、定裝版的視角
 * GET  /api/videos/:id/plan/versions/:version    某一版
 * POST /api/videos/:id/plan/generate             Agent 產生第 1 版
 * POST /api/videos/:id/plan/versions             手動修改或回到舊版（新增一個版本）
 */
export function registerPlanRoutes(_app: FastifyInstance, _plans: PlanService): void {
  // 尚未實作
}
