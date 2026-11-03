import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { loadPromptFiles, loadWorkflowConfig, promptsDir, workflowsFile } from '@templeyard/prompts';
import { createCloudAssetSender, createLimiter, type CloudAssetTransport, type ComfyClient } from '@templeyard/comfy-client';
import type { PromptWriter } from '@templeyard/prompts';
import type { HealthResponse, PromptFile, WorkflowConfig } from '@templeyard/shared';
import { findAsset } from './assets/repository.js';
import { createAssetStore } from './assets/store.js';
import { createConsentStore, type ConsentStore } from './costs/consents.js';
import type { AppDatabase } from './db/client.js';
import { createGenerationService, type SucceededHandler } from './generations/service.js';
import { resolveDataDir } from './paths.js';
import { registerAssetRoutes } from './routes/assets.js';
import { registerCostRoutes } from './routes/costs.js';
import { registerPhotoRoutes } from './routes/photos.js';
import { registerSeriesRoutes } from './routes/series.js';
import { registerTempleBoardRoutes } from './routes/templeBoards.js';
import { registerTempleRoutes } from './routes/temples.js';
import { registerVideoRoutes } from './routes/videos.js';
import type { Clock } from './series/repository.js';
import { TEMPLE_VIEW_NODE, createTempleBoardService } from './templeBoards/service.js';

export type AppDeps = {
  db: AppDatabase;
  /** 測試可注入固定的時間與 ID */
  clock?: Clock;
  /** 檔案資料夾（data/assets/）；測試可指定暫存資料夾 */
  assetsDir?: string;
  /** workflows/models.json；預設讀 repo 裡的設定檔 */
  workflows?: WorkflowConfig;
  consents?: ConsentStore;
  /**
   * 生成用的外部連線（Comfy Cloud MCP、Claude 撰寫者、圖片上傳）；沒有設定時為 null，
   * 生成端點回 503 並說明 generationUnavailableMessage
   */
  generation?: GenerationRuntime | null;
  generationUnavailableMessage?: string;
  /** prompt-studio/prompts 的內容；預設讀 repo 裡的檔案 */
  prompts?: ReadonlyMap<string, PromptFile>;
};

export type GenerationRuntime = {
  comfy: ComfyClient;
  writer: PromptWriter;
  transport: CloudAssetTransport;
  /** 同時執行數（COMFY_MAX_CONCURRENT），預設 1 */
  maxConcurrent?: number;
};

const systemClock: Clock = { now: () => new Date(), newId: () => randomUUID() };

// 建立 Fastify 應用；路由在這裡註冊，方便測試用 inject 呼叫。
export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/api/health', async (): Promise<HealthResponse> => ({ status: 'ok' }));
  const clock = deps.clock ?? systemClock;
  const store = createAssetStore(deps.assetsDir ?? path.join(resolveDataDir(), 'assets'));

  const workflows = deps.workflows ?? loadWorkflowConfig(workflowsFile);
  // 同意憑證要猜不到：32 bytes 亂數
  const consents = deps.consents ?? createConsentStore({ now: () => new Date(), newToken: () => randomBytes(32).toString('hex') });

  // 生成服務：完成時依節點把產出接到各自的資料表（handlers 在建立定裝版服務後才填）
  const handlers: Record<string, SucceededHandler> = {};
  const runtime = deps.generation ?? null;
  const generation = runtime
    ? createGenerationService({
        db: deps.db,
        comfy: runtime.comfy,
        store,
        workflows,
        consents,
        limiter: createLimiter(runtime.maxConcurrent ?? 1),
        clock,
        handlers,
      })
    : null;
  const boards = createTempleBoardService({
    db: deps.db,
    clock,
    workflows,
    prompts: deps.prompts ?? loadPromptFiles(promptsDir),
    store,
    generation:
      runtime && generation
        ? {
            service: generation,
            writer: runtime.writer,
            sendAsset: createCloudAssetSender({
              transport: runtime.transport,
              readBytes: async (asset) => {
                const found = findAsset(deps.db, asset.id);
                if (!found) throw new Error(`找不到檔案：${asset.id}`);
                return store.read(found.path);
              },
            }),
          }
        : null,
    ...(deps.generationUnavailableMessage ? { unavailableMessage: deps.generationUnavailableMessage } : {}),
  });
  handlers[TEMPLE_VIEW_NODE] = boards.handleGenerated;

  registerTempleRoutes(app, deps.db);
  registerSeriesRoutes(app, deps.db, clock);
  registerVideoRoutes(app, deps.db, clock, boards);
  registerPhotoRoutes(app, deps.db, clock, store);
  registerAssetRoutes(app, deps.db, store);
  registerCostRoutes(app, deps.db, workflows, consents);
  registerTempleBoardRoutes(app, boards);

  // 啟動時以 prompt_id 取回已送出、還沒完成的任務（F21），不重新送出
  if (generation) app.addHook('onReady', async () => generation.resumeUnfinished());

  return app;
}
