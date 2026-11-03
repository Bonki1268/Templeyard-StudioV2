import { assistRequestSchema, type ApiError } from '@templeyard/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { z } from 'zod';
import type { AssistService } from '../assist/service.js';
import { errorBody } from '../http/errorBody.js';
import { toValidationError } from '../http/errors.js';
import { StudioError } from '../studio/errors.js';

type LogParams = { Params: { id: string } };

/** 請求資料不正確：說明直接寫第一個欄位的錯誤 */
function invalid(error: z.ZodError): ApiError {
  const body = toValidationError(error, 'AI 幫我寫的資料不正確');
  return { ...body, message: Object.values(body.fieldErrors ?? {})[0] ?? body.message };
}

async function handle<T>(reply: FastifyReply, run: () => T | Promise<T>): Promise<T | FastifyReply> {
  try {
    return await run();
  } catch (error: unknown) {
    if (error instanceof StudioError) return reply.status(error.status).send(errorBody(error.message));
    throw error;
  }
}

/**
 * POST /api/assist              產生 AI 建議（回應 { log }）
 * GET  /api/assist/:id          查看這筆 AI 建議
 * POST /api/assist/:id/adopt    使用者按下「採用」
 */
export function registerAssistRoutes(app: FastifyInstance, assist: AssistService): void {
  app.post('/api/assist', async (request, reply) => {
    const parsed = assistRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send(invalid(parsed.error));
    return handle(reply, async () => ({ log: await assist.suggest(parsed.data) }));
  });

  app.get<LogParams>('/api/assist/:id', async (request, reply) => handle(reply, () => ({ log: assist.find(request.params.id) })));

  app.post<LogParams>('/api/assist/:id/adopt', async (request, reply) => handle(reply, () => ({ log: assist.adopt(request.params.id) })));
}
