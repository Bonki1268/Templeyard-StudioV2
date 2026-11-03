import type { FastifyInstance } from 'fastify';
import type { ChatService } from '../studio/chat.js';
import type { QuestionnaireService } from '../studio/questionnaire.js';

/**
 * GET  /api/videos/:id/chat            對話紀錄
 * POST /api/videos/:id/chat            與 Agent 對話；檢查不通過時回 JSON 錯誤，通過後以 SSE 串流（text/event-stream）
 * GET  /api/videos/:id/questionnaire   問卷（還沒開啟時 questionnaire 是 null）
 * PUT  /api/videos/:id/questionnaire   送出問卷
 */
export function registerStudioRoutes(_app: FastifyInstance, _chat: ChatService, _questionnaires: QuestionnaireService): void {
  // 尚未實作
}
