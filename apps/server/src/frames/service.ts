import type { CloudAssetRef } from '@templeyard/comfy-client';
import type { PromptWriter } from '@templeyard/prompts';
import type { CloudOkAsset, CostCheck, FramesResponse, InvalidationChange, PromptFile, WorkflowConfig } from '@templeyard/shared';
import type { CharacterService } from '../characters/service.js';
import type { AppDatabase } from '../db/client.js';
import type { GenerationService, SucceededHandler } from '../generations/service.js';
import type { PlanService } from '../plans/service.js';
import type { Clock } from '../series/repository.js';

// 精緻圖（F14）：依方案為每格產生首格（開啟中間關鍵畫格的格子另外產生末格），
// 參考角色定裝圖、定裝版視角圖與對應照片；生成中只顯示「生成中」，完成後逐格確認；修改時依失效規則標示需重新確認

export const REFINED_FRAME_NODE = 'refined-frame';

export type FrameGeneration = {
  service: GenerationService;
  writer: PromptWriter;
  /** 型別上只收 cloud_ok 的資產 */
  sendAsset: (asset: CloudOkAsset) => Promise<CloudAssetRef>;
};

export type FramesOutcome = { status: 'consent_required'; check: CostCheck } | { status: 'accepted'; frames: FramesResponse };

export type FrameService = {
  /** 每格目前的精緻圖與生成狀態；影片不存在：StudioError 404 */
  get(videoId: string): FramesResponse;
  /**
   * 生成所有格的精緻圖：
   * - 方案檢查沒過或角色沒確認：409「還不能生成：<第一個原因>」
   * - 已經在生成：409「精緻圖還在生成中」
   * - 沒有同意憑證：consent_required；沒有設定生成服務：503
   * - 送出後影片進到 frames_generating，全部完成後進到 frames
   */
  generate(videoId: string, consentToken: string | null | undefined): Promise<FramesOutcome>;
  /** 單格重生：產生新的一張，要重新確認；方案沒有這一格：404「方案沒有這一格」 */
  regenerate(videoId: string, shotKey: string, kind: 'first' | 'last', consentToken: string | null | undefined): Promise<FramesOutcome>;
  /** 確認這一格（首格，需要時加末格）；還沒產生完成：409「第 N 格的精緻圖還沒產生完成」 */
  confirm(videoId: string, shotKey: string): FramesResponse;
  /** 依失效規則把受影響的精緻圖標示需重新確認 */
  invalidate(videoId: string, change: InvalidationChange): void;
  handleGenerated: SucceededHandler;
};

export function createFrameService(_deps: {
  db: AppDatabase;
  clock: Clock;
  workflows: WorkflowConfig;
  prompts: ReadonlyMap<string, PromptFile>;
  plans: PlanService;
  characters: CharacterService;
  generation: FrameGeneration | null;
  unavailableMessage?: string;
}): FrameService {
  throw new Error('尚未實作');
}
