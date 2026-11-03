import { generateClipsSchema } from '@templeyard/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ClipService } from '../clips/service.js';
import { errorBody } from '../http/errorBody.js';
import { toValidationError } from '../http/errors.js';
import { StudioError } from '../studio/errors.js';

type VideoParams = { Params: { id: string } };

const CONSENT_MESSAGE = '這次生成需要先同意費用';

async function handle<T>(reply: FastifyReply, run: () => T | Promise<T>): Promise<T | FastifyReply> {
  try {
    return await run();
  } catch (error: unknown) {
    if (error instanceof StudioError) return reply.status(error.status).send(errorBody(error.message));
    throw error;
  }
}

/**
 * 分鏡影片與成品（第 11 階段）：
 * GET  /api/videos/:id/clips            每格的影片、成品與生成狀態
 * POST /api/videos/:id/generate/clips   生成影片（需要同意時 409），全部完成後在本機合成成品
 */
export function registerClipRoutes(app: FastifyInstance, clips: ClipService): void {
  app.get<VideoParams>('/api/videos/:id/clips', async (request, reply) => handle(reply, () => clips.get(request.params.id)));

  app.post<VideoParams>('/api/videos/:id/generate/clips', async (request, reply) => {
    const parsed = generateClipsSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      const body = toValidationError(parsed.error, '同意憑證格式不正確');
      return reply.status(400).send({ ...body, message: Object.values(body.fieldErrors ?? {})[0] ?? body.message });
    }
    return handle(reply, async () => {
      const outcome = await clips.generate(request.params.id, parsed.data.consentToken);
      if (outcome.status === 'consent_required') return reply.status(409).send({ message: CONSENT_MESSAGE, check: outcome.check });
      return reply.status(202).send(outcome.clips);
    });
  });
}
