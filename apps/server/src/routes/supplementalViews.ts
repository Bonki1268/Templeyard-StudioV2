import { addSupplementalViewSchema, type ApiError } from '@templeyard/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { z } from 'zod';
import { errorBody } from '../http/errorBody.js';
import { toValidationError } from '../http/errors.js';
import type { PlanService } from '../plans/service.js';
import { TempleBoardError, type TempleBoardService } from '../templeBoards/service.js';

type VideoParams = { Params: { id: string } };
type ViewParams = { Params: { id: string; viewKey: string } };

const CONSENT_MESSAGE = '這次生成需要先同意費用';

function invalid(error: z.ZodError): ApiError {
  const body = toValidationError(error, '補充視角的資料不正確');
  return { ...body, message: Object.values(body.fieldErrors ?? {})[0] ?? body.message };
}

async function handle<T>(reply: FastifyReply, run: () => T | Promise<T>): Promise<T | FastifyReply> {
  try {
    return await run();
  } catch (error: unknown) {
    if (error instanceof TempleBoardError) return reply.status(error.status).send(errorBody(error.message));
    throw error;
  }
}

/**
 * POST /api/videos/:id/temple-board/supplemental-views                       補充視角（需要同意時 409）
 * POST /api/videos/:id/temple-board/supplemental-views/:viewKey/confirm      確認；方案裡缺少這個視角的格子改用它
 */
export function registerSupplementalViewRoutes(app: FastifyInstance, boards: TempleBoardService, plans: PlanService): void {
  app.post<VideoParams>('/api/videos/:id/temple-board/supplemental-views', async (request, reply) => {
    const parsed = addSupplementalViewSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send(invalid(parsed.error));
    return handle(reply, async () => {
      const outcome = await boards.addSupplementalView(request.params.id, parsed.data);
      if (outcome.status === 'consent_required') return reply.status(409).send({ message: CONSENT_MESSAGE, check: outcome.check });
      return reply.status(202).send({ board: outcome.board });
    });
  });

  app.post<ViewParams>('/api/videos/:id/temple-board/supplemental-views/:viewKey/confirm', async (request, reply) =>
    handle(reply, () => {
      const board = boards.confirmSupplementalView(request.params.id, request.params.viewKey);
      const view = board.views.find((v) => v.viewKey === request.params.viewKey);
      // 方案寫成「missing:後殿」的格子，改用補充好的「custom:後殿」
      const plan = view ? plans.replaceViewKey(request.params.id, `missing:${view.viewName}`, view.viewKey) : null;
      return { board, plan: plan ?? plans.current(request.params.id) };
    }),
  );
}

