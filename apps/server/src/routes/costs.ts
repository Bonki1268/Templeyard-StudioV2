import { costRequestSchema, updateSettingsSchema, type ApiError, type CostCheck, type WorkflowConfig } from '@templeyard/shared';
import type { FastifyInstance } from 'fastify';
import type { ConsentStore } from '../costs/consents.js';
import { UnknownModelError, checkConsent, estimateCost } from '../costs/estimate.js';
import { getSettings, updateSettings, videoSpending } from '../costs/repository.js';
import type { AppDatabase } from '../db/client.js';
import { errorBody } from '../http/errorBody.js';
import { toValidationError } from '../http/errors.js';
import { findVideo } from '../videos/repository.js';

const CONSENT_MESSAGE = '需要同意：這次生成要你再按一次同意才會送出';

type VideoParams = { Params: { id: string } };

/**
 * POST /api/videos/:id/cost-estimate：預估這次生成，回傳要不要再次同意
 * POST /api/videos/:id/consents：使用者同意後發同意憑證
 * GET /api/videos/:id/cost：已用、預留、上限、門檻
 * GET /api/settings、PATCH /api/settings：單筆同意門檻
 */
export function registerCostRoutes(app: FastifyInstance, db: AppDatabase, workflows: WorkflowConfig, consents: ConsentStore): void {
  function budgetFor(videoId: string, costLimit: number | null) {
    return { ...videoSpending(db, videoId), limit: costLimit, threshold: getSettings(db).consentThresholdCredits };
  }

  /** 模型不在設定檔時回傳 400 的錯誤內容，否則回傳預估 */
  function estimateOr400(items: Parameters<typeof estimateCost>[0]) {
    try {
      return { estimate: estimateCost(items, workflows) };
    } catch (error: unknown) {
      if (!(error instanceof UnknownModelError)) throw error;
      const body: ApiError = { message: '費用預估的資料不正確', fieldErrors: { [`items.${error.index}.model`]: error.message } };
      return { error: body };
    }
  }

  app.post<VideoParams>('/api/videos/:id/cost-estimate', async (request, reply) => {
    const video = findVideo(db, request.params.id);
    if (!video) return reply.status(404).send(errorBody('找不到這支影片'));
    const parsed = costRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send(toValidationError(parsed.error, '費用預估的資料不正確'));
    const result = estimateOr400(parsed.data.items);
    if (result.error) return reply.status(400).send(result.error);
    const budget = budgetFor(video.id, video.costLimit);
    const consent = checkConsent(result.estimate, budget, workflows);
    const body: CostCheck & { message: string } = {
      estimate: result.estimate,
      budget,
      consent,
      message: consent.required ? CONSENT_MESSAGE : '',
    };
    return body;
  });

  app.post<VideoParams>('/api/videos/:id/consents', async (request, reply) => {
    const video = findVideo(db, request.params.id);
    if (!video) return reply.status(404).send(errorBody('找不到這支影片'));
    const parsed = costRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send(toValidationError(parsed.error, '費用預估的資料不正確'));
    const result = estimateOr400(parsed.data.items);
    if (result.error) return reply.status(400).send(result.error);
    const { token, expiresAt } = consents.issue(video.id, parsed.data.items);
    return reply.status(201).send({ consentToken: token, expiresAt, estimate: result.estimate });
  });

  app.get<VideoParams>('/api/videos/:id/cost', async (request, reply) => {
    const video = findVideo(db, request.params.id);
    if (!video) return reply.status(404).send(errorBody('找不到這支影片'));
    return { budget: budgetFor(video.id, video.costLimit) };
  });

  app.get('/api/settings', async () => ({ settings: getSettings(db) }));

  app.patch('/api/settings', async (request, reply) => {
    const parsed = updateSettingsSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send(toValidationError(parsed.error, '設定的資料不正確'));
    return { settings: updateSettings(db, parsed.data) };
  });
}
