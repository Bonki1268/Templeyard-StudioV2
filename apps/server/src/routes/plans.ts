import { createPlanVersionSchema, type ApiError } from '@templeyard/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { z } from 'zod';
import { errorBody } from '../http/errorBody.js';
import { toValidationError } from '../http/errors.js';
import type { PlanService } from '../plans/service.js';
import { StudioError } from '../studio/errors.js';

type VideoParams = { Params: { id: string } };
type VersionParams = { Params: { id: string; version: string } };

/** 請求資料不正確：說明直接寫第一個欄位的錯誤 */
function invalid(error: z.ZodError): ApiError {
  const body = toValidationError(error, '方案的資料不正確');
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
 * GET  /api/videos/:id/plan                      現行方案、版本清單、檢查規則、定裝版的視角
 * GET  /api/videos/:id/plan/versions/:version    某一版
 * POST /api/videos/:id/plan/generate             Agent 產生第 1 版
 * POST /api/videos/:id/plan/versions             手動修改或回到舊版（新增一個版本）
 */
export function registerPlanRoutes(app: FastifyInstance, plans: PlanService): void {
  app.get<VideoParams>('/api/videos/:id/plan', async (request, reply) => handle(reply, () => plans.get(request.params.id)));

  app.get<VersionParams>('/api/videos/:id/plan/versions/:version', async (request, reply) =>
    handle(reply, () => ({ plan: plans.version(request.params.id, Number(request.params.version)) })),
  );

  app.post<VideoParams>('/api/videos/:id/plan/generate', async (request, reply) =>
    handle(reply, async () => {
      const plan = await plans.generate(request.params.id);
      return reply.status(201).send({ plan });
    }),
  );

  app.post<VideoParams>('/api/videos/:id/plan/versions', async (request, reply) => {
    const parsed = createPlanVersionSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send(invalid(parsed.error));
    return handle(reply, () => reply.status(201).send({ plan: plans.createVersion(request.params.id, parsed.data) }));
  });
}
