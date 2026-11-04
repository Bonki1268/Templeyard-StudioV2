import type { Asset, AssetKind, CostCheck, CostEstimate, CostItem, McpCall, WorkflowConfig } from '@templeyard/shared';
import type { ComfyClient, Limiter, WaitResult } from '@templeyard/comfy-client';
import { and, eq, inArray } from 'drizzle-orm';
import { insertAsset } from '../assets/repository.js';
import type { AssetStore } from '../assets/store.js';
import { seriesConsentScope, type ConsentStore } from '../costs/consents.js';
import { checkConsent, estimateCost } from '../costs/estimate.js';
import { getSettings, seriesSpending, videoSpending } from '../costs/repository.js';
import type { AppDatabase } from '../db/client.js';
import { generations, videos, type GenerationRow } from '../db/schema.js';
import type { Clock } from '../series/repository.js';

export type GenerationRequest = {
  /** 屬於哪一支影片；系列角色庫的生成不屬於任何影片（null），改看 seriesId */
  videoId: string | null;
  /** videoId 為 null 時必填：費用與同意憑證算在這個系列（使用者 2026-11-05 提出） */
  seriesId?: string | null;
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

export type BatchOutcome =
  | { status: 'consent_required'; check: CostCheck }
  | { status: 'accepted'; generationIds: string[] };

/** 費用的範圍：影片編號，或不屬於任何影片的系列（系列沒有影片上限，只看單筆門檻） */
export type CostScope = string | { seriesId: string };

/** 生成請求的費用範圍 */
export function scopeOf(request: Pick<GenerationRequest, 'videoId' | 'seriesId'>): CostScope {
  if (request.videoId) return request.videoId;
  if (request.seriesId) return { seriesId: request.seriesId };
  throw new Error('生成請求要指定影片或系列');
}

/** 同意憑證綁定的範圍 */
function consentKey(scope: CostScope): string {
  return typeof scope === 'string' ? scope : seriesConsentScope(scope.seriesId);
}

/** 付費生成前的檢查結果（不作廢同意憑證） */
export type Precheck = { ok: true } | { ok: false; check: CostCheck };

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
  /**
   * 一次送出好幾筆（例如定裝版的每個視角）：把所有項目合起來預估、檢查一次同意，
   * 只作廢一次同意憑證；需要同意時一筆都不送出、不留紀錄
   */
  submitBatch(requests: readonly Omit<GenerationRequest, 'consentToken'>[], consentToken: string | null | undefined): Promise<BatchOutcome>;
  /**
   * 和 submit 一樣的預估與同意檢查，但不送出、不作廢同意憑證。
   * 之後要用 submitBatch 送出時，傳入每一筆的項目（requestItems），單筆同意門檻才會和 submitBatch 一樣看每一筆。
   */
  precheck(
    scope: CostScope,
    costItems: readonly CostItem[],
    consentToken: string | null | undefined,
    requestItems?: readonly CostItem[][],
  ): Precheck;
  /** 把一個檔案存成資產（例如使用者上傳、已去識別的首格）；和生成的產出存在同一個資料夾 */
  saveAsset(input: { kind: AssetKind; mime: string; bytes: Uint8Array }): Asset;
  /** 等某筆生成結束（成功、失敗或逾時），回傳最後的紀錄 */
  whenSettled(generationId: string): Promise<GenerationRow>;
  /** 啟動時呼叫：已送出、生成中的紀錄以 prompt_id 繼續追蹤，不重新送出；還沒送出的標示失敗 */
  resumeUnfinished(): Promise<void>;
};

const TIMEOUT_MESSAGE = '等待超過時間還沒完成，任務可能仍在雲端執行；保留任務編號，之後可以再查詢';
const NOT_SUBMITTED_MESSAGE = '系統重新啟動時這筆生成還沒送出，沒有重送；需要時請重新生成';

/** 每筆生成的輸出種類：成功時下載到這種資產（重啟後從輸入紀錄取回） */
const OUTPUT_KIND_KEY = 'outputKind';

/** 同一個模型的數量加總，順序依第一次出現（同意憑證比對的是使用者看到的項目） */
function combineItems(items: readonly CostItem[]): CostItem[] {
  const combined: CostItem[] = [];
  for (const item of items) {
    const existing = combined.find((c) => c.model === item.model);
    if (existing) existing.units += item.units;
    else combined.push({ ...item });
  }
  return combined;
}

/** 生成紀錄的 model 欄位：供應商的模型代號或範本名稱（05「generations」），例如 vertexai/nano-banana-pro */
export function providerModelOf(call: McpCall): string {
  const value = call.tool === 'run_template' ? call.args.name : call.args.model;
  if (typeof value !== 'string' || value === '') throw new Error('MCP 呼叫裡沒有模型代號或範本名稱');
  return value;
}

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

  /** 預估並檢查門檻與上限（不作廢同意憑證） */
  function checkFor(scope: CostScope, costItems: readonly CostItem[]): CostCheck {
    const estimate = estimateCost([...costItems], deps.workflows);
    const threshold = getSettings(db).consentThresholdCredits;
    let budget;
    if (typeof scope === 'string') {
      const video = db.select({ costLimit: videos.costLimit }).from(videos).where(eq(videos.id, scope)).get();
      budget = { ...videoSpending(db, scope), limit: video?.costLimit ?? null, threshold };
    } else {
      // 系列角色庫：沒有影片上限，只看單筆門檻
      budget = { ...seriesSpending(db, scope.seriesId), limit: null, threshold };
    }
    return { estimate, budget, consent: checkConsent(estimate, budget, deps.workflows) };
  }

  /**
   * 一批的檢查：單筆同意門檻看每一筆；本支影片上限與單價待實測看整批合計。
   * 同意憑證對應整批合計的項目。
   */
  function batchCheck(scope: CostScope, requests: readonly { costItems: CostItem[] }[], items: readonly CostItem[]): CostCheck {
    const combined = checkFor(scope, items);
    const reasons = combined.consent.reasons.filter((reason) => reason.code !== 'over_threshold');
    const overThreshold = requests
      .map((request) => checkFor(scope, request.costItems).consent.reasons.find((reason) => reason.code === 'over_threshold'))
      .find((reason) => reason !== undefined);
    if (overThreshold) reasons.push(overThreshold);
    return { ...combined, consent: { required: reasons.length > 0, reasons } };
  }

  /** 同意檢查已通過：寫入紀錄、預留費用、排進佇列；有空位時等送出完成才回傳 */
  async function accept(request: Omit<GenerationRequest, 'consentToken'>, estimate: CostEstimate): Promise<string> {
    const id = clock.newId();
    db.insert(generations)
      .values({
        id,
        videoId: request.videoId,
        node: request.node,
        // 不屬於任何影片的生成記下系列，用來算這個系列的已用與預留
        target: request.videoId ? request.target : { ...request.target, seriesId: request.seriesId ?? null },
        promptIdRef: request.promptRef?.id ?? null,
        promptVersion: request.promptRef?.version ?? null,
        mcpTool: request.call.tool,
        model: providerModelOf(request.call),
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
    return id;
  }

  return {
    async submit(request) {
      const scope = scopeOf(request);
      const check = checkFor(scope, request.costItems);
      if (check.consent.required && !deps.consents.consume(request.consentToken, consentKey(scope), request.costItems)) {
        return { status: 'consent_required', check };
      }
      const id = await accept(request, check.estimate);
      return { status: 'accepted', generationId: id };
    },

    saveAsset(input) {
      const id = clock.newId();
      const saved = store.save({ id, kind: input.kind, mime: input.mime, bytes: input.bytes });
      return insertAsset(db, { id, kind: input.kind, mime: input.mime, path: saved.path, sha256: saved.sha256 });
    },

    async submitBatch(requests, consentToken) {
      const first = requests[0];
      if (!first) throw new Error('沒有要送出的生成');
      const items = combineItems(requests.flatMap((request) => request.costItems));
      const scope = scopeOf(first);
      const check = batchCheck(scope, requests, items);
      if (check.consent.required && !deps.consents.consume(consentToken, consentKey(scope), items)) {
        return { status: 'consent_required', check };
      }
      const generationIds: string[] = [];
      for (const request of requests) {
        generationIds.push(await accept(request, estimateCost(request.costItems, deps.workflows)));
      }
      return { status: 'accepted', generationIds };
    },

    precheck(scope, costItems, consentToken, requestItems) {
      const check = requestItems
        ? batchCheck(scope, requestItems.map((items) => ({ costItems: items })), costItems)
        : checkFor(scope, costItems);
      if (check.consent.required && !deps.consents.peek(consentToken, consentKey(scope), costItems)) return { ok: false, check };
      return { ok: true };
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
