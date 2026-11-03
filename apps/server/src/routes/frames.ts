import { formatSseEvent, generateFramesSchema, regenerateFrameSchema, type ApiError, type VideoEvent } from '@templeyard/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { z } from 'zod';
import type { FrameService, FramesOutcome } from '../frames/service.js';
import { errorBody } from '../http/errorBody.js';
import { toValidationError } from '../http/errors.js';
import { StudioError } from '../studio/errors.js';

type VideoParams = { Params: { id: string } };
type ShotParams = { Params: { id: string; shotKey: string } };

const CONSENT_MESSAGE = '這次生成需要先同意費用';
/** SSE 檢查生成狀態的間隔 */
const EVENT_POLL_MS = 1000;

function invalid(error: z.ZodError): ApiError {
  const body = toValidationError(error, '精緻圖的資料不正確');
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
 * GET  /api/videos/:id/frames                              每格的精緻圖與生成狀態
 * POST /api/videos/:id/generate/frames                     生成所有格的精緻圖（需要同意時 409）
 * POST /api/videos/:id/shots/:shotKey/regenerate           單格重生（body：kind、consentToken）
 * POST /api/videos/:id/shots/:shotKey/frames/confirm       確認這一格的精緻圖
 * GET  /api/videos/:id/events                              SSE：精緻圖生成中、完成（沒有在生成時送出目前狀態就結束）
 */
export function registerFrameRoutes(app: FastifyInstance, frames: FrameService): void {
  app.get<VideoParams>('/api/videos/:id/frames', async (request, reply) => handle(reply, () => frames.get(request.params.id)));

  app.post<VideoParams>('/api/videos/:id/generate/frames', async (request, reply) => {
    const parsed = generateFramesSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send(invalid(parsed.error));
    return handle(reply, async () => sendOutcome(reply, await frames.generate(request.params.id, parsed.data.consentToken)));
  });

  app.post<ShotParams>('/api/videos/:id/shots/:shotKey/regenerate', async (request, reply) => {
    const parsed = regenerateFrameSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send(invalid(parsed.error));
    return handle(reply, async () =>
      sendOutcome(reply, await frames.regenerate(request.params.id, request.params.shotKey, parsed.data.kind, parsed.data.consentToken)),
    );
  });

  app.post<ShotParams>('/api/videos/:id/shots/:shotKey/frames/confirm', async (request, reply) =>
    handle(reply, () => frames.confirm(request.params.id, request.params.shotKey)),
  );

  app.get<VideoParams>('/api/videos/:id/events', async (request, reply) => {
    let snapshot;
    try {
      snapshot = frames.get(request.params.id);
    } catch (error: unknown) {
      if (error instanceof StudioError) return reply.status(error.status).send(errorBody(error.message));
      throw error;
    }
    reply.hijack();
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const send = (state: { generating: boolean; generatingLabel: string | null }) => {
      const event: VideoEvent = { type: 'frames', generating: state.generating, generatingLabel: state.generatingLabel };
      reply.raw.write(formatSseEvent('frames', event));
    };
    send(snapshot);
    if (!snapshot.generating) {
      reply.raw.end();
      return reply;
    }
    // 生成中：狀態變了才送；完成後送出最後狀態並結束
    let last = JSON.stringify([snapshot.generating, snapshot.generatingLabel]);
    const timer = setInterval(() => {
      try {
        const now = frames.get(request.params.id);
        const key = JSON.stringify([now.generating, now.generatingLabel]);
        if (key !== last) {
          last = key;
          send(now);
        }
        if (!now.generating) {
          clearInterval(timer);
          reply.raw.end();
        }
      } catch {
        clearInterval(timer);
        reply.raw.end();
      }
    }, EVENT_POLL_MS);
    request.raw.on('close', () => clearInterval(timer));
    return reply;
  });
}
