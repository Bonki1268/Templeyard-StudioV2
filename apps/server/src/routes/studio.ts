import { chatRequestSchema, formatSseEvent, submitQuestionnaireSchema, type ApiError } from '@templeyard/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { z } from 'zod';
import { errorBody } from '../http/errorBody.js';
import { toValidationError } from '../http/errors.js';
import type { ChatService } from '../studio/chat.js';
import { StudioError } from '../studio/errors.js';
import type { QuestionnaireService } from '../studio/questionnaire.js';

type VideoParams = { Params: { id: string } };

/** 請求資料不正確：說明直接寫第一個欄位的錯誤 */
function invalid(error: z.ZodError, fallback: string): ApiError {
  const body = toValidationError(error, fallback);
  return { ...body, message: Object.values(body.fieldErrors ?? {})[0] ?? body.message };
}

/** 創作工作區服務的錯誤轉成 HTTP 回應；其他錯誤往上丟（500） */
async function handle<T>(reply: FastifyReply, run: () => T | Promise<T>): Promise<T | FastifyReply> {
  try {
    return await run();
  } catch (error: unknown) {
    if (error instanceof StudioError) return reply.status(error.status).send(errorBody(error.message));
    throw error;
  }
}

/**
 * GET  /api/videos/:id/chat            對話紀錄
 * POST /api/videos/:id/chat            與 Agent 對話；檢查不通過時回 JSON 錯誤，通過後以 SSE 串流（text/event-stream）
 * GET  /api/videos/:id/questionnaire   問卷（還沒開啟時 questionnaire 是 null）
 * PUT  /api/videos/:id/questionnaire   送出問卷
 */
export function registerStudioRoutes(app: FastifyInstance, chat: ChatService, questionnaires: QuestionnaireService): void {
  app.get<VideoParams>('/api/videos/:id/chat', async (request, reply) => handle(reply, () => ({ messages: chat.list(request.params.id) })));

  app.post<VideoParams>('/api/videos/:id/chat', async (request, reply) => {
    const parsed = chatRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send(invalid(parsed.error, '請輸入想對 Agent 說的話'));
    try {
      chat.prepare(request.params.id);
    } catch (error: unknown) {
      if (error instanceof StudioError) return reply.status(error.status).send(errorBody(error.message));
      throw error;
    }
    // 串流開始後狀態碼固定是 200；之後的失敗以 error 事件說明
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    try {
      await chat.send(request.params.id, parsed.data.content, (event) => {
        reply.raw.write(formatSseEvent(event.type, event));
      });
    } catch (error: unknown) {
      request.log.error(error);
      reply.raw.write(formatSseEvent('error', { type: 'error', message: 'Agent 回覆失敗，請再試一次' }));
    } finally {
      reply.raw.end();
    }
    return reply;
  });

  app.get<VideoParams>('/api/videos/:id/questionnaire', async (request, reply) =>
    handle(reply, () => ({ questionnaire: questionnaires.get(request.params.id) })),
  );

  app.put<VideoParams>('/api/videos/:id/questionnaire', async (request, reply) => {
    const parsed = submitQuestionnaireSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send(invalid(parsed.error, '問卷的資料不正確'));
    return handle(reply, () => questionnaires.submit(request.params.id, parsed.data));
  });
}
