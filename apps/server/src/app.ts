import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ClaudeModel } from '@templeyard/agent';
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
import { createAssistService } from './assist/service.js';
import { CHARACTER_LOOK_NODE, CHARACTER_SHEET_NODE, createCharacterService } from './characters/service.js';
import { createPlanService } from './plans/service.js';
import { FRAME_NODES, createFrameService, type FrameService } from './frames/service.js';
import { planChangeInvalidations } from '@templeyard/shared';
import { registerAssetRoutes } from './routes/assets.js';
import { registerAssistRoutes } from './routes/assist.js';
import { registerFrameRoutes } from './routes/frames.js';
import { registerClipRoutes } from './routes/clips.js';
import { CLIP_NODES, createClipService, type ClipService } from './clips/service.js';
import { createFfmpeg } from './compose/ffmpeg.js';
import { createCopyService } from './copy/service.js';
import { registerShotDetailRoutes } from './routes/shotDetail.js';
import { registerCharacterRoutes } from './routes/characters.js';
import { registerCostRoutes } from './routes/costs.js';
import { registerPhotoRoutes } from './routes/photos.js';
import { registerPlanRoutes } from './routes/plans.js';
import { registerSeriesRoutes } from './routes/series.js';
import { registerStudioRoutes } from './routes/studio.js';
import { registerSupplementalViewRoutes } from './routes/supplementalViews.js';
import { registerTempleBoardRoutes } from './routes/templeBoards.js';
import { registerTempleRoutes } from './routes/temples.js';
import { registerVideoRoutes } from './routes/videos.js';
import type { Clock } from './series/repository.js';
import { createChatService } from './studio/chat.js';
import { createQuestionnaireService } from './studio/questionnaire.js';
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
  /**
   * 文字 AI（創作 Agent、AI 輔助撰寫）用的 Claude；沒有設定時為 null，
   * 對話與 AI 幫我寫回 503 並說明 textUnavailableMessage
   */
  text?: TextRuntime | null;
  textUnavailableMessage?: string;
};

export type TextRuntime = {
  /** 創作 Agent（CLAUDE_MODEL_AGENT） */
  agent: ClaudeModel;
  /** AI 輔助撰寫（CLAUDE_MODEL_ASSIST） */
  assist: ClaudeModel;
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
  const prompts = deps.prompts ?? loadPromptFiles(promptsDir);
  // 精緻圖與影片服務比定裝版、角色服務晚建立：先宣告，變動通知在呼叫時才讀取
  let frameService: FrameService | null = null;
  let clipService: ClipService | null = null;
  const boards = createTempleBoardService({
    db: deps.db,
    clock,
    workflows,
    prompts,
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
    // 定裝版確認新版本：用到換過的視角的精緻圖、關鍵畫格、影片要重新確認（03 第 160 行）
    onVersionConfirmed: (videoId, viewKeys) => frameService?.invalidate(videoId, { type: 'templeBoard', viewKeys }),
  });
  handlers[TEMPLE_VIEW_NODE] = boards.handleGenerated;

  registerTempleRoutes(app, deps.db);
  registerSeriesRoutes(app, deps.db, clock);
  registerVideoRoutes(app, deps.db, clock, boards);
  registerPhotoRoutes(app, deps.db, clock, store);
  registerAssetRoutes(app, deps.db, store);
  registerCostRoutes(app, deps.db, workflows, consents);
  registerTempleBoardRoutes(app, boards);

  // 創作對話、問卷、AI 輔助撰寫：Claude 沒有設定時回 503 並說明 textUnavailableMessage
  const text = deps.text ?? null;
  const unavailable = deps.textUnavailableMessage ? { unavailableMessage: deps.textUnavailableMessage } : {};
  const questionnaires = createQuestionnaireService({ db: deps.db, clock });
  // 角色定裝版：生成用 Comfy Cloud（與定裝版相同的生成服務），沒有設定時回 503
  // 精緻圖服務在方案與角色之後建立；這兩者改版時透過它標示需重新確認
  const characters = createCharacterService({
    db: deps.db,
    clock,
    workflows,
    prompts,
    generation: runtime && generation ? { service: generation, writer: runtime.writer } : null,
    ...(deps.generationUnavailableMessage ? { unavailableMessage: deps.generationUnavailableMessage } : {}),
    // 確認過的角色改了：這個角色出現的格子，精緻圖需重新確認（03 確認失效規則）
    onVersionChanged: (character) => {
      if (character.videoId) frameService?.invalidate(character.videoId, { type: 'character', characterName: character.name });
    },
  });
  handlers[CHARACTER_SHEET_NODE] = characters.handleGenerated;
  handlers[CHARACTER_LOOK_NODE] = characters.handleGenerated;
  // 方案改版：改到的格子，精緻圖需重新確認（03 確認失效規則）
  const plans = createPlanService({
    db: deps.db,
    clock,
    workflows,
    prompts,
    model: text?.agent ?? null,
    characters,
    onVersionSaved: (videoId, previous, next) => {
      for (const change of planChangeInvalidations(previous, next.shots, next.diff.changedShotKeys)) frameService?.invalidate(videoId, change);
    },
    ...unavailable,
  });
  const frameGeneration =
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
      : null;
  frameService = createFrameService({
    db: deps.db,
    clock,
    store,
    // 精緻圖的失效與首格更換轉給影片服務（影片與成品）
    onChange: (videoId, change) => clipService?.invalidate(videoId, change),
    clipOf: (videoId, shotKey) => clipService?.clipOf(videoId, shotKey) ?? null,
    workflows,
    prompts,
    plans,
    characters,
    generation: frameGeneration,
    ...(deps.generationUnavailableMessage ? { unavailableMessage: deps.generationUnavailableMessage } : {}),
  });
  for (const node of FRAME_NODES) handlers[node] = frameService.handleGenerated;
  clipService = createClipService({
    db: deps.db,
    clock,
    workflows,
    prompts,
    plans,
    characters,
    frames: frameService,
    generation: frameGeneration,
    store,
    ffmpeg: createFfmpeg({ ffmpegPath: process.env.FFMPEG_PATH, ffprobePath: process.env.FFPROBE_PATH }),
    ...(deps.generationUnavailableMessage ? { unavailableMessage: deps.generationUnavailableMessage } : {}),
  });
  for (const node of CLIP_NODES) handlers[node] = clipService.handleGenerated;
  const chat = createChatService({ db: deps.db, clock, workflows, consents, questionnaires, plans, clips: () => clipService, model: text?.agent ?? null, ...unavailable });
  registerStudioRoutes(app, chat, questionnaires);
  registerPlanRoutes(app, plans);
  registerCharacterRoutes(app, characters);
  registerSupplementalViewRoutes(app, boards, plans);
  registerFrameRoutes(app, frameService);
  registerClipRoutes(app, clipService, createCopyService({ db: deps.db, clock, plans, characters }));
  registerShotDetailRoutes(app, frameService, plans, chat);
  registerAssistRoutes(app, createAssistService({ db: deps.db, clock, prompts, model: text?.assist ?? null, ...unavailable }));

  // 啟動時以 prompt_id 取回已送出、還沒完成的任務（F21），不重新送出
  if (generation) app.addHook('onReady', async () => generation.resumeUnfinished());

  return app;
}
