import type { WorkflowConfig } from '@templeyard/shared';
import type { FastifyInstance } from 'fastify';
import type { ConsentStore } from '../costs/consents.js';
import type { AppDatabase } from '../db/client.js';

/**
 * POST /api/videos/:id/cost-estimate：預估這次生成，回傳要不要再次同意
 * POST /api/videos/:id/consents：使用者同意後發同意憑證
 * GET /api/videos/:id/cost：已用、預留、上限、門檻
 * GET /api/settings、PATCH /api/settings：單筆同意門檻
 */
export function registerCostRoutes(
  _app: FastifyInstance,
  _db: AppDatabase,
  _workflows: WorkflowConfig,
  _consents: ConsentStore,
): void {
  throw new Error('尚未實作');
}
