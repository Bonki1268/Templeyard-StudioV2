import type { FastifyInstance } from 'fastify';
import type { AssistService } from '../assist/service.js';

/**
 * POST /api/assist              產生 AI 建議（回應 { log }）
 * GET  /api/assist/:id          查看這筆 AI 建議
 * POST /api/assist/:id/adopt    使用者按下「採用」
 */
export function registerAssistRoutes(_app: FastifyInstance, _assist: AssistService): void {
  // 尚未實作
}
