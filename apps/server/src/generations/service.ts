import type { AssetKind, CostCheck, CostItem, McpCall, WorkflowConfig } from '@templeyard/shared';
import type { ComfyClient, Limiter, WaitResult } from '@templeyard/comfy-client';
import { and, eq, inArray } from 'drizzle-orm';
import { insertAsset } from '../assets/repository.js';
import type { AssetStore } from '../assets/store.js';
import type { ConsentStore } from '../costs/consents.js';
import { checkConsent, estimateCost } from '../costs/estimate.js';
import { getSettings, videoSpending } from '../costs/repository.js';
import type { AppDatabase } from '../db/client.js';
import { generations, videos, type GenerationRow } from '../db/schema.js';
import type { Clock } from '../series/repository.js';

export type GenerationRequest = {
  videoId: string;
  /** 節點代號，例如 temple-view */
  node: string;
  target: Record<string, unknown>;
  promptRef: { id: string; version: number } | null;
  modelKey: string;
  call: McpCall;
  costItems: CostItem[];
  consentToken?: string | null;
  /** 組裝後的指令與參數（不含金鑰），寫進紀錄 */
  input: Record<string, unknown>;
  userInstruction?: string | null;
  /** 下載回來的檔案存成哪一種資產 */
  outputKind: AssetKind;
};

export type SubmitOutcome =
  | { status: 'consent_required'; check: CostCheck }
  | { status: 'accepted'; generationId: string };

/** 生成成功後，由各節點把資產接到自己的資料表（第 5 階段起註冊） */
export type SucceededHandler = (generation: GenerationRow, assetIds: string[]) => void;

export type GenerationServiceDeps = {
  db: AppDatabase;
  comfy: ComfyClient;
  store: AssetStore;
  workflows: WorkflowConfig;
  consents: ConsentStore;
  limiter: Limiter;
  clock: Clock;
  handlers?: Record<string, SucceededHandler>;
};

export type GenerationService = {
  /**
   * 付費生成的唯一入口：
   * 1. 預估並檢查門檻與上限；需要同意卻沒有有效的同意憑證 → 不送出，回傳 consent_required
   * 2. 寫入生成紀錄並預留費用
   * 3. 先不帶 confirm 送出；雲端要求確認時記下確認文字，再帶 confirm: true 送出（本系統的檢查已通過）
   * 4. 拿到 prompt_id 立刻寫入，之後在背景追蹤、下載、結算
   * 有空位時等到送出完成才回傳（送出失敗可以馬上知道）；要排隊時直接回傳
   */
  submit(request: GenerationRequest): Promise<SubmitOutcome>;
  /** 等某筆生成結束（成功、失敗或逾時），回傳最後的紀錄 */
  whenSettled(generationId: string): Promise<GenerationRow>;
  /** 啟動時呼叫：已送出、生成中的紀錄以 prompt_id 繼續追蹤，不重新送出；還沒送出的標示失敗 */
  resumeUnfinished(): Promise<void>;
};

const TIMEOUT_MESSAGE = '等待超過時間還沒完成，任務可能仍在雲端執行；保留任務編號，之後可以再查詢';
const NOT_SUBMITTED_MESSAGE = '系統重新啟動時這筆生成還沒送出，沒有重送；需要時請重新生成';

/** 每筆生成的輸出種類：成功時下載到這種資產（重啟後從輸入紀錄取回） */
const OUTPUT_KIND_KEY = 'outputKind';

export function createGenerationService(deps: GenerationServiceDeps): GenerationService {
  const { db, comfy, store, clock } = deps;
  const settled = new Map<string, Promise<GenerationRow>>();
  const nowIso = () => clock.now().toISOString();

  function get(id: string): GenerationRow {
    const row = db.select().from(generations).where(eq(generations.id, id)).get();
    if (!row) throw new Error(`沒有這筆生成紀錄：${id}`);
    return row;
  }

  function update(id: string, patch: Partial<GenerationRow>): GenerationRow {
    db.update(generations).set(patch).where(eq(generations.id, id)).run();
    return get(id);
  }

  function fail(id: string, message: string): GenerationRow {
    return update(id, { status: 'failed', reservedCost: 0, error: message, finishedAt: nowIso() });
  }

  function outputKindOf(row: GenerationRow): AssetKind {
    const kind = row.input[OUTPUT_KIND_KEY];
    return typeof kind === 'string' ? (kind as AssetKind) : 'frame';
  }

  async function collect(row: GenerationRow, urls: string[]): Promise<GenerationRow> {
    const assetIds: string[] = [];
    for (const url of urls) {
      const file = await comfy.download(url);
      const id = clock.newId();
      const kind = outputKindOf(row);
      const saved = store.save({ id, kind, mime: file.mime, bytes: file.bytes });
      insertAsset(db, { id, kind, mime: file.mime, path: saved.path, sha256: saved.sha256 });
      assetIds.push(id);
    }
    // 實際扣點的查詢方式還沒實測（07「下一輪測試」），先以預估結算
    const done = update(row.id, {
      status: 'succeeded',
      reservedCost: 0,
      actualCost: row.estimatedCost,
      error: null,
      finishedAt: nowIso(),
    });
    deps.handlers?.[row.node]?.(done, assetIds);
    return done;
  }

  async function finish(row: GenerationRow, result: WaitResult): Promise<GenerationRow> {
    if (result.kind === 'completed') return collect(row, result.urls);
    if (result.kind === 'failed') return fail(row.id, result.message);
    // 逾時：保留 prompt_id 與預留費用，任務可能仍在雲端執行
    return update(row.id, { status: 'timeout', error: TIMEOUT_MESSAGE, finishedAt: nowIso() });
  }

  async function track(id: string): Promise<GenerationRow> {
    const row = update(id, { status: 'running' });
    if (!row.providerTaskId) return fail(id, '沒有任務編號，無法追蹤');
    const startedAt = Date.parse(row.createdAt);
    const result = await comfy.waitForJob(row.providerTaskId, {
      startedAt: Number.isNaN(startedAt) ? clock.now().getTime() : startedAt,
    });
    return finish(row, result);
  }

  /** 送出階段結束（拿到 prompt_id、直接完成或失敗）時通知；submit 用它決定什麼時候回應 */
  const submittedSignals = new Map<string, () => void>();
  const signalSubmitted = (id: string) => {
    submittedSignals.get(id)?.();
    submittedSignals.delete(id);
  };

  async function run(id: string, call: McpCall): Promise<GenerationRow> {
    try {
      let result = await comfy.submit(call, { confirm: false });
      if (result.kind === 'confirm_required') {
        update(id, { confirmRequired: true, confirmMessage: result.message });
        // 本系統的預估、門檻、上限與同意都已通過，才帶 confirm: true
        result = await comfy.submit(call, { confirm: true });
      }
      if (result.kind === 'confirm_required') return fail(id, '雲端一直要求確認花費，沒有送出');
      if (result.kind === 'completed') return await collect(get(id), result.urls);
      // 拿到 prompt_id 立刻寫入，之後才開始追蹤（02「任務中斷恢復」）
      update(id, { providerTaskId: result.promptId, status: 'submitted' });
      signalSubmitted(id);
      return await track(id);
    } catch (error: unknown) {
      return fail(id, error instanceof Error ? error.message : '生成失敗');
    } finally {
      signalSubmitted(id);
    }
  }

  function schedule(id: string, task: () => Promise<GenerationRow>) {
    const promise = deps.limiter.run(task).catch((error: unknown) => fail(id, error instanceof Error ? error.message : '生成失敗'));
    settled.set(id, promise);
  }

  return {
    async submit(request) {
      const estimate = estimateCost(request.costItems, deps.workflows);
      const video = db.select({ costLimit: videos.costLimit }).from(videos).where(eq(videos.id, request.videoId)).get();
      const budget = {
        ...videoSpending(db, request.videoId),
        limit: video?.costLimit ?? null,
        threshold: getSettings(db).consentThresholdCredits,
      };
      const consent = checkConsent(estimate, budget, deps.workflows);
      if (consent.required && !deps.consents.consume(request.consentToken, request.videoId, request.costItems)) {
        return { status: 'consent_required', check: { estimate, budget, consent } };
      }

      const id = clock.newId();
      db.insert(generations)
        .values({
          id,
          videoId: request.videoId,
          node: request.node,
          target: request.target,
          promptIdRef: request.promptRef?.id ?? null,
          promptVersion: request.promptRef?.version ?? null,
          mcpTool: request.call.tool,
          model: request.modelKey,
          callConfigVersion: deps.workflows.version,
          status: 'awaiting_confirm',
          input: { ...request.input, call: request.call, [OUTPUT_KIND_KEY]: request.outputKind },
          userInstruction: request.userInstruction ?? null,
          estimatedCost: estimate.credits,
          reservedCost: estimate.credits ?? 0,
          createdAt: nowIso(),
        })
        .run();
      const submitted = new Promise<void>((resolve) => submittedSignals.set(id, resolve));
      schedule(id, () => run(id, request.call));
      // 有空位時等送出完成（prompt_id 已寫入或已失敗）才回應；排隊中的直接回應
      if (deps.limiter.waiting === 0) await submitted;
      return { status: 'accepted', generationId: id };
    },

    whenSettled(generationId) {
      return settled.get(generationId) ?? Promise.resolve(get(generationId));
    },

    async resumeUnfinished() {
      const notSubmitted = db
        .select()
        .from(generations)
        .where(eq(generations.status, 'awaiting_confirm'))
        .all();
      for (const row of notSubmitted) fail(row.id, NOT_SUBMITTED_MESSAGE);

      const unfinished = db
        .select()
        .from(generations)
        .where(and(inArray(generations.status, ['submitted', 'running'])))
        .all();
      for (const row of unfinished) {
        if (!row.providerTaskId) {
          fail(row.id, NOT_SUBMITTED_MESSAGE);
          continue;
        }
        schedule(row.id, () => track(row.id));
      }
    },
  };
}
