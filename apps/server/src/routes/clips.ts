import { generateClipsSchema } from '@templeyard/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { createReadStream } from 'node:fs';
import type { ClipService } from '../clips/service.js';
import type { CopyService } from '../copy/service.js';
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
 * POST /api/videos/:id/final/confirm    確認成品（影片階段變為 done）
 * GET  /api/videos/:id/final/download   下載成品 MP4
 * POST /api/videos/:id/copy             複製影片
 */
export function registerClipRoutes(app: FastifyInstance, clips: ClipService, copies: CopyService): void {
  // 成品（第 12 階段）：確認後影片階段變為 done；下載 MP4；複製影片
  app.post<VideoParams>('/api/videos/:id/final/confirm', async (request, reply) => handle(reply, () => clips.confirmFinal(request.params.id)));

  app.get<VideoParams>('/api/videos/:id/final/download', async (request, reply) =>
    handle(reply, () => {
      const file = clips.finalFile(request.params.id);
      // 中文檔名用 RFC 5987 的 filename*；filename 給不支援的瀏覽器
      return reply
        .header('Content-Type', 'video/mp4')
        .header('Content-Disposition', `attachment; filename="final.mp4"; filename*=UTF-8''${encodeURIComponent(file.filename)}`)
        .send(createReadStream(file.path));
    }),
  );

  app.post<VideoParams>('/api/videos/:id/copy', async (request, reply) => handle(reply, () => reply.status(201).send({ video: copies.copy(request.params.id) })));

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
