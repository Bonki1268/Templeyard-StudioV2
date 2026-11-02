import type { AssetKind, CostCheck, CostItem, McpCall, WorkflowConfig } from '@templeyard/shared';
import type { ComfyClient, Limiter } from '@templeyard/comfy-client';
import type { AssetStore } from '../assets/store.js';
import type { ConsentStore } from '../costs/consents.js';
import type { AppDatabase } from '../db/client.js';
import type { GenerationRow } from '../db/schema.js';
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
   */
  submit(request: GenerationRequest): Promise<SubmitOutcome>;
  /** 等某筆生成結束（成功、失敗或逾時），回傳最後的紀錄 */
  whenSettled(generationId: string): Promise<GenerationRow>;
  /** 啟動時呼叫：已送出、生成中的紀錄以 prompt_id 繼續追蹤，不重新送出；還沒送出的標示失敗 */
  resumeUnfinished(): Promise<void>;
};

export function createGenerationService(_deps: GenerationServiceDeps): GenerationService {
  throw new Error('尚未實作');
}
