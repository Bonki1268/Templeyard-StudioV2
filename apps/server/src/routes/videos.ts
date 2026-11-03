import { MODELS_LOCKED_MESSAGE, TEMPLE_LOCKED_MESSAGE, createVideoSchema, updateVideoSchema, type VideoDetail } from '@templeyard/shared';
import type { FastifyInstance } from 'fastify';
import type { AppDatabase } from '../db/client.js';
import { toValidationError } from '../http/errors.js';
import { errorBody } from '../http/errorBody.js';
import { listPhotosForVideo } from '../photos/repository.js';
import { findSeries, type Clock } from '../series/repository.js';
import { findTemple } from '../temples/repository.js';
import { toTempleSummary } from '../temples/search.js';
import type { TempleBoardService } from '../templeBoards/service.js';
import { createVideo, findVideo, updateVideo } from '../videos/repository.js';

const INVALID_MESSAGE = '影片資料不正確';
const VIDEO_NOT_FOUND = '找不到這支影片';
const SERIES_NOT_FOUND = '找不到這個系列';
const TEMPLE_NOT_FOUND = '找不到這間寺廟';

/** POST /api/videos、GET /api/videos/:id、PATCH /api/videos/:id */
export function registerVideoRoutes(app: FastifyInstance, db: AppDatabase, clock: Clock, boards: TempleBoardService): void {
  app.post('/api/videos', async (request, reply) => {
    const parsed = createVideoSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send(toValidationError(parsed.error, INVALID_MESSAGE));
    const series = findSeries(db, parsed.data.seriesId);
    if (!series) return reply.status(404).send(errorBody(SERIES_NOT_FOUND));
    if (!findTemple(db, parsed.data.templeId)) return reply.status(404).send(errorBody(TEMPLE_NOT_FOUND));

    // 模型帶入系列「現在」的預設值；之後改系列不會影響這支影片
    const video = createVideo(
      db,
      {
        seriesId: series.id,
        templeId: parsed.data.templeId,
        imageModel: series.defaultImageModel,
        videoModel: series.defaultVideoModel,
      },
      clock,
    );
    return reply.status(201).send({ video });
  });

  app.get<{ Params: { id: string } }>('/api/videos/:id', async (request, reply) => {
    const video = findVideo(db, request.params.id);
    if (!video) return reply.status(404).send(errorBody(VIDEO_NOT_FOUND));
    const temple = findTemple(db, video.templeId);
    if (!temple) return reply.status(404).send(errorBody(TEMPLE_NOT_FOUND));
    // 這支影片還沒有定裝版時，帶出同系列同一間廟確認過、可以沿用的版本
    const reusableBoard = video.templeBoardVersionId ? null : boards.reusableFor(video.seriesId, video.templeId);
    const body: VideoDetail = { video, temple: toTempleSummary(temple), photos: listPhotosForVideo(db, video), reusableBoard };
    return body;
  });

  app.patch<{ Params: { id: string } }>('/api/videos/:id', async (request, reply) => {
    const parsed = updateVideoSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send(toValidationError(parsed.error, INVALID_MESSAGE));
    const existing = findVideo(db, request.params.id);
    if (!existing) return reply.status(404).send(errorBody(VIDEO_NOT_FOUND));
    // 產生（或沿用）寺廟定裝版後，模型與寺廟都不能再改（05「後端強制的規則」）
    if (existing.modelsLockedAt !== null) {
      if (parsed.data.imageModel !== undefined || parsed.data.videoModel !== undefined) {
        return reply.status(409).send(errorBody(MODELS_LOCKED_MESSAGE));
      }
      if (parsed.data.templeId !== undefined) return reply.status(409).send(errorBody(TEMPLE_LOCKED_MESSAGE));
    }
    if (parsed.data.templeId !== undefined && !findTemple(db, parsed.data.templeId)) {
      return reply.status(404).send(errorBody(TEMPLE_NOT_FOUND));
    }
    const video = updateVideo(db, request.params.id, parsed.data, clock);
    if (!video) return reply.status(404).send(errorBody(VIDEO_NOT_FOUND));
    return { video };
  });
}
