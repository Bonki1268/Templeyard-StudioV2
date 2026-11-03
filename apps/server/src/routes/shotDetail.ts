import { chatRequestSchema, formatSseEvent, generateFramesSchema, regionEditSchema, shotPatchSchema, uploadFrameSchema, type ApiError } from '@templeyard/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { z } from 'zod';
import type { FrameService, FramesOutcome } from '../frames/service.js';
import { errorBody } from '../http/errorBody.js';
import { toValidationError } from '../http/errors.js';
import type { PlanService } from '../plans/service.js';
import type { ChatService } from '../studio/chat.js';
import { StudioError } from '../studio/errors.js';

type ShotParams = { Params: { id: string; shotKey: string } };
type FrameParams = { Params: { id: string; shotKey: string; frameId: string } };

const CONSENT_MESSAGE = '這次生成需要先同意費用';

function invalid(error: z.ZodError): ApiError {
  const body = toValidationError(error, '細修的資料不正確');
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

function sendOutcome(reply: FastifyReply, outcome: FramesOutcome) {
  if (outcome.status === 'consent_required') return reply.status(409).send({ message: CONSENT_MESSAGE, check: outcome.check });
  return reply.status(202).send(outcome.frames);
}

/**
 * 分鏡細修（第 10 階段）：
 * GET   /api/videos/:id/shots/:shotKey                          細修頁的資料
 * PATCH /api/videos/:id/shots/:shotKey                          儲存這一格（新增方案版本）
 * POST  /api/videos/:id/shots/:shotKey/frames/upload            上傳自己的首格／末格（已去識別）
 * POST  /api/videos/:id/shots/:shotKey/frames/:frameId/select   選回這一張
 * POST  /api/videos/:id/shots/:shotKey/frames/:frameId/edit     限定範圍修改（需要同意時 409）
 * POST  /api/videos/:id/shots/:shotKey/keyframes/generate       產生中間關鍵畫格（需要同意時 409）
 * GET   /api/videos/:id/shots/:shotKey/chat                     這一格的對話
 * POST  /api/videos/:id/shots/:shotKey/chat                     與 Agent 對話（只針對這一格，SSE）
 */
export function registerShotDetailRoutes(app: FastifyInstance, frames: FrameService, plans: PlanService, chat: ChatService): void {
  app.get<ShotParams>('/api/videos/:id/shots/:shotKey', async (request, reply) => handle(reply, () => frames.detail(request.params.id, request.params.shotKey)));

  app.patch<ShotParams>('/api/videos/:id/shots/:shotKey', async (request, reply) => {
    const parsed = shotPatchSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send(invalid(parsed.error));
    return handle(reply, () => ({ plan: plans.updateShot(request.params.id, request.params.shotKey, parsed.data) }));
  });

  app.post<ShotParams>('/api/videos/:id/shots/:shotKey/frames/upload', async (request, reply) => {
    const parsed = uploadFrameSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send(invalid(parsed.error));
    return handle(reply, () => frames.upload(request.params.id, request.params.shotKey, parsed.data));
  });

  app.post<FrameParams>('/api/videos/:id/shots/:shotKey/frames/:frameId/select', async (request, reply) =>
    handle(reply, () => frames.select(request.params.id, request.params.shotKey, request.params.frameId)),
  );

  app.post<FrameParams>('/api/videos/:id/shots/:shotKey/frames/:frameId/edit', async (request, reply) => {
    const parsed = regionEditSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send(invalid(parsed.error));
    return handle(reply, async () => sendOutcome(reply, await frames.editRegion(request.params.id, request.params.shotKey, request.params.frameId, parsed.data)));
  });

  app.post<ShotParams>('/api/videos/:id/shots/:shotKey/keyframes/generate', async (request, reply) => {
    const parsed = generateFramesSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send(invalid(parsed.error));
    return handle(reply, async () => sendOutcome(reply, await frames.generateKeyframes(request.params.id, request.params.shotKey, parsed.data.consentToken)));
  });

  app.get<ShotParams>('/api/videos/:id/shots/:shotKey/chat', async (request, reply) =>
    handle(reply, () => ({ messages: chat.list(request.params.id, request.params.shotKey) })),
  );

  app.post<ShotParams>('/api/videos/:id/shots/:shotKey/chat', async (request, reply) => {
    const parsed = chatRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send(invalid(parsed.error));
    try {
      chat.prepare(request.params.id);
      chat.list(request.params.id, request.params.shotKey);
    } catch (error: unknown) {
      if (error instanceof StudioError) return reply.status(error.status).send(errorBody(error.message));
      throw error;
    }
    reply.hijack();
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    try {
      await chat.send(request.params.id, parsed.data.content, (event) => reply.raw.write(formatSseEvent(event.type, event)), request.params.shotKey);
    } catch (error: unknown) {
      request.log.error(error);
      reply.raw.write(formatSseEvent('error', { type: 'error', message: 'Agent 回覆失敗，請再試一次' }));
    } finally {
      reply.raw.end();
    }
    return reply;
  });
}
