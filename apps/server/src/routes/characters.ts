import { createSeriesCharacterSchema, generateCharacterSchema, parseCharacterScope, updateCharacterSchema, type ApiError } from '@templeyard/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { CharacterService } from '../characters/service.js';
import { errorBody } from '../http/errorBody.js';
import { toValidationError } from '../http/errors.js';
import { StudioError } from '../studio/errors.js';

type VideoParams = { Params: { id: string } };
type CharacterParams = { Params: { cid: string } };
type SeriesParams = { Params: { id: string } };

const CONSENT_MESSAGE = '這次生成需要先同意費用';
// 沒有 videoId：系列角色庫產生系列角色的定裝圖（使用者 2026-11-05 提出）
const generateBodySchema = generateCharacterSchema.extend({ videoId: z.string({ error: '請指定是哪一支影片' }).optional() });

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
 * POST  /api/characters/:cid/generate           產生三視圖與定裝圖（body：videoId〔系列角色可省略〕、consentToken）；需要同意時 409
 * POST  /api/characters/:cid/confirm            確認
 * POST  /api/characters/:cid/series             設為系列角色
 * GET   /api/series/:id/characters               系列角色庫（使用者 2026-11-05 提出）
 * POST  /api/series/:id/characters               系列角色庫新增角色
 */
export function registerCharacterRoutes(app: FastifyInstance, characters: CharacterService): void {
  app.get<VideoParams>('/api/videos/:id/characters', async (request, reply) =>
    handle(reply, () => ({ characters: characters.listForVideo(request.params.id) })),
  );

  // 系列頁角色庫（第 14 階段）：系列角色加上這個系列影片的影片專屬角色；?scope=all|series|video、?q= 搜尋名稱或描述
  app.get<SeriesParams & { Querystring: { scope?: string; q?: string } }>('/api/series/:id/characters', async (request, reply) => {
    const scope = parseCharacterScope(request.query.scope);
    if (!scope) return reply.status(400).send(errorBody('篩選條件不正確'));
    return handle(reply, () => ({ characters: characters.listLibrary(request.params.id, { scope, query: request.query.q ?? '' }) }));
  });

  app.get<CharacterParams>('/api/characters/:cid/versions', async (request, reply) =>
    handle(reply, () => ({ versions: characters.versions(request.params.cid) })),
  );

  app.get<CharacterParams>('/api/characters/:cid/usage', async (request, reply) =>
    handle(reply, () => ({ videos: characters.usage(request.params.cid) })),
  );

  app.post<SeriesParams>('/api/series/:id/characters', async (request, reply) => {
    const parsed = createSeriesCharacterSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send(invalid(parsed.error));
    return handle(reply, () => reply.status(201).send({ character: characters.createForSeries(request.params.id, parsed.data) }));
  });

  app.patch<CharacterParams>('/api/characters/:cid', async (request, reply) => {
    const parsed = updateCharacterSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send(invalid(parsed.error));
    return handle(reply, () => ({ character: characters.update(request.params.cid, parsed.data) }));
  });

  app.post<CharacterParams>('/api/characters/:cid/generate', async (request, reply) => {
    const parsed = generateBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send(invalid(parsed.error));
    return handle(reply, async () => {
      const outcome = await characters.generate(request.params.cid, parsed.data.videoId ?? null, parsed.data.consentToken, parsed.data.part);
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
