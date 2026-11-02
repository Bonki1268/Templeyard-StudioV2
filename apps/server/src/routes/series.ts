import {
  createSeriesSchema,
  updateSeriesSchema,
  type ApiError,
} from '@templeyard/shared';
import type { FastifyInstance } from 'fastify';
import type { AppDatabase } from '../db/client.js';
import { toValidationError } from '../http/errors.js';
import { createSeries, listSeries, updateSeries, type Clock } from '../series/repository.js';

const INVALID_MESSAGE = '系列資料不正確';

/** GET /api/series、POST /api/series、PATCH /api/series/:id */
export function registerSeriesRoutes(app: FastifyInstance, db: AppDatabase, clock: Clock): void {
  app.get('/api/series', async () => ({ series: listSeries(db) }));

  app.post('/api/series', async (request, reply) => {
    const parsed = createSeriesSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send(toValidationError(parsed.error, INVALID_MESSAGE));
    return reply.status(201).send({ series: createSeries(db, parsed.data, clock) });
  });

  app.patch<{ Params: { id: string } }>('/api/series/:id', async (request, reply) => {
    const parsed = updateSeriesSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send(toValidationError(parsed.error, INVALID_MESSAGE));
    const updated = updateSeries(db, request.params.id, parsed.data, clock);
    if (!updated) {
      const notFound: ApiError = { message: '找不到這個系列' };
      return reply.status(404).send(notFound);
    }
    return { series: updated };
  });
}
