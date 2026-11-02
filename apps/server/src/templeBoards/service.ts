import type { CloudAssetRef } from '@templeyard/comfy-client';
import type { PromptWriter } from '@templeyard/prompts';
import type {
  CloudOkAsset,
  CostCheck,
  GenerateTempleBoardInput,
  PromptFile,
  RegenerateTempleViewInput,
  ReusableTempleBoard,
  TempleBoard,
  UpdateTempleBoardInput,
  Video,
  WorkflowConfig,
} from '@templeyard/shared';
import type { AssetStore } from '../assets/store.js';
import type { AppDatabase } from '../db/client.js';
import type { GenerationService, SucceededHandler } from '../generations/service.js';
import type { Clock } from '../series/repository.js';

// 寺廟定裝版（03「/videos/:vid/temple-board」、05「temple_boards」、規格書「產生寺廟定裝版」）

export const TEMPLE_VIEW_NODE = 'temple-view';

/** 定裝版的操作錯誤；status 對應 HTTP 狀態碼 */
export class TempleBoardError extends Error {
  override name = 'TempleBoardError';
  constructor(
    readonly status: 400 | 404 | 409 | 502 | 503,
    message: string,
  ) {
    super(message);
  }
}

export type TempleBoardGeneration = {
  service: GenerationService;
  writer: PromptWriter;
  /** 把去識別後的照片送到雲端；型別上只收 cloud_ok 的資產 */
  sendAsset: (asset: CloudOkAsset) => Promise<CloudAssetRef>;
};

export type TempleBoardServiceDeps = {
  db: AppDatabase;
  clock: Clock;
  workflows: WorkflowConfig;
  prompts: ReadonlyMap<string, PromptFile>;
  store: AssetStore;
  /** 沒有設定 Comfy Cloud 或 Claude 時為 null：生成相關的操作回 503，說明 unavailableMessage */
  generation: TempleBoardGeneration | null;
  unavailableMessage?: string;
};

export type GenerateOutcome = { status: 'consent_required'; check: CostCheck } | { status: 'accepted'; board: TempleBoard };

export type TempleBoardService = {
  /** 這支影片使用的定裝版；還沒有時為 null */
  detail(videoId: string): TempleBoard | null;
  /** 同系列同一間廟目前確認過的版本（建立影片頁的「沿用定裝版」） */
  reusableFor(seriesId: string, templeId: string): ReusableTempleBoard | null;
  /**
   * 產生寺廟定裝版：檢查照片與視角 → 檢查同意（不作廢）→ 每個視角請撰寫者寫最終指令、上傳參考圖、組出 MCP 呼叫
   * → 一次送出（作廢同意憑證）→ 建立定裝版與視角列、鎖定模型、影片進入 board_pending。
   * 任何一步失敗都不留下定裝版、不鎖定模型。
   */
  generate(videoId: string, input: GenerateTempleBoardInput): Promise<GenerateOutcome>;
  /** 單張重生（可帶修改指令）；有這個視角的照片時改為依照片；完成後替換該張並標示需重新確認 */
  regenerateView(videoId: string, viewKey: string, input: RegenerateTempleViewInput): Promise<GenerateOutcome>;
  confirmView(videoId: string, viewKey: string): TempleBoard;
  update(videoId: string, input: UpdateTempleBoardInput): TempleBoard;
  /** 確認定裝版：所有視角都產生且確認後才可以；影片進入 chat，記下確認紀錄 */
  confirm(videoId: string): { board: TempleBoard; video: Video };
  /** 沿用同系列同一間廟確認過的版本；鎖定模型 */
  reuse(videoId: string): TempleBoard;
  /** 以這支影片目前（已確認）的版本另存新版本：複製視角圖與外觀規範，新版本尚未確認 */
  saveAsNewVersion(videoId: string): TempleBoard;
  /** 生成服務的 temple-view 完成處理：把視角圖接到視角列 */
  handleGenerated: SucceededHandler;
};

export function createTempleBoardService(_deps: TempleBoardServiceDeps): TempleBoardService {
  throw new Error('尚未實作');
}
