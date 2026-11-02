import { templeSearchQuerySchema, type TempleSearchResponse } from '@templeyard/shared';
import type { FastifyInstance } from 'fastify';
import type { AppDatabase } from '../db/client.js';
import { listTemples } from '../temples/repository.js';
import { searchTemples, toTempleSummary } from '../temples/search.js';

/** GET /api/temples?q=&includeInactive=&limit= */
export function registerTempleRoutes(app: FastifyInstance, db: AppDatabase): void {
  app.get('/api/temples', async (request, reply) => {
    const parsed = templeSearchQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        message: '查詢參數不正確：q 最多 100 字、includeInactive 為 true 或 false、limit 為 1～100',
      });
    }
    const rows = listTemples(db, { includeInactive: parsed.data.includeInactive });
    const body: TempleSearchResponse = {
      temples: searchTemples(rows, parsed.data).map(toTempleSummary),
    };
    return body;
  });
}
