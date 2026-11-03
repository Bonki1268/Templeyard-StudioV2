import { generateCharacterSchema, updateCharacterSchema, type ApiError } from '@templeyard/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { CharacterService } from '../characters/service.js';
import { errorBody } from '../http/errorBody.js';
import { toValidationError } from '../http/errors.js';
import { StudioError } from '../studio/errors.js';

type VideoParams = { Params: { id: string } };
type CharacterParams = { Params: { cid: string } };

const CONSENT_MESSAGE = '這次生成需要先同意費用';
const generateBodySchema = generateCharacterSchema.extend({ videoId: z.string({ error: '請指定是哪一支影片' }) });

function invalid(error: z.ZodError): ApiError {
  const body = toValidationError(error, '角色的資料不正確');
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
 * GET   /api/videos/:id/characters             這支影片能用的角色
 * PATCH /api/characters/:cid                    外觀描述與連續性鎖
 * POST  /api/characters/:cid/generate           產生三視圖與定裝圖（body：videoId、consentToken）；需要同意時 409
 * POST  /api/characters/:cid/confirm            確認
 * POST  /api/characters/:cid/series             設為系列角色
 */
export function registerCharacterRoutes(app: FastifyInstance, characters: CharacterService): void {
  app.get<VideoParams>('/api/videos/:id/characters', async (request, reply) =>
    handle(reply, () => ({ characters: characters.listForVideo(request.params.id) })),
  );

  app.patch<CharacterParams>('/api/characters/:cid', async (request, reply) => {
    const parsed = updateCharacterSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send(invalid(parsed.error));
    return handle(reply, () => ({ character: characters.update(request.params.cid, parsed.data) }));
  });

  app.post<CharacterParams>('/api/characters/:cid/generate', async (request, reply) => {
    const parsed = generateBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send(invalid(parsed.error));
    return handle(reply, async () => {
      const outcome = await characters.generate(request.params.cid, parsed.data.videoId, parsed.data.consentToken);
      if (outcome.status === 'consent_required') return reply.status(409).send({ message: CONSENT_MESSAGE, check: outcome.check });
      return reply.status(202).send({ character: outcome.character });
    });
  });

  app.post<CharacterParams>('/api/characters/:cid/confirm', async (request, reply) =>
    handle(reply, () => ({ character: characters.confirm(request.params.cid) })),
  );

  app.post<CharacterParams>('/api/characters/:cid/series', async (request, reply) =>
    handle(reply, () => ({ character: characters.setSeries(request.params.cid) })),
  );
}
