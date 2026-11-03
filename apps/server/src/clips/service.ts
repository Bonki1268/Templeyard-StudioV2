import type { Clip, ClipsResponse, CostCheck, InvalidationChange, PromptFile, WorkflowConfig } from '@templeyard/shared';
import type { AssetStore } from '../assets/store.js';
import type { CharacterService } from '../characters/service.js';
import type { Ffmpeg } from '../compose/ffmpeg.js';
import type { AppDatabase } from '../db/client.js';
import type { FrameGeneration, FrameService } from '../frames/service.js';
import type { SucceededHandler } from '../generations/service.js';
import type { PlanService } from '../plans/service.js';
import type { Clock } from '../series/repository.js';

// 分鏡影片與成品（F15）：每格以確認的精緻圖為首格（需要時含末格與中間關鍵畫格）生成影片，
// 背景音樂另外生成（ACE-Step）；全部完成後在本機用 FFmpeg 合成成品（不花錢）

export const SHOT_VIDEO_NODE = 'shot-video';
/** 背景音樂的生成節點（沒有生成指令檔，曲風寫在 workflows 設定） */
export const MUSIC_NODE = 'background-music';
/** 影片服務接手的生成節點 */
export const CLIP_NODES = [SHOT_VIDEO_NODE, MUSIC_NODE] as const;

/** 偏差比對時擷取畫面的大小 */
export const SIMILARITY_SIZE = { width: 64, height: 36 } as const;

export type ClipsOutcome = { status: 'consent_required'; check: CostCheck } | { status: 'accepted'; clips: ClipsResponse };

export type ClipService = {
  /** 每格目前的影片、成品與生成狀態；影片不存在：StudioError 404 */
  get(videoId: string): ClipsResponse;
  /**
   * 生成影片：
   * - 精緻圖還沒全部確認：409「還不能生成影片：<第一個原因>」
   * - 已經在生成或合成：409「影片還在生成中」
   * - 沒有同意憑證：consent_required；沒有設定生成服務、模型的首格輸入方式還沒實測：503
   * - 只生成還沒有可用影片的格子（沒有、失敗或需重新確認）；背景音樂還沒有時一併生成
   * - 送出後影片進到 video_generating；全部完成後合成成品，進到 final
   */
  generate(videoId: string, consentToken: string | null | undefined): Promise<ClipsOutcome>;
  /** 依失效規則把受影響的影片標示需重新確認（成品跟著需重新確認） */
  invalidate(videoId: string, change: InvalidationChange): void;
  /** 這一格目前的影片（細修頁的偏差比對） */
  clipOf(videoId: string, shotKey: string): Clip | null;
  /** 等目前的合成結束（測試與重新啟動後使用） */
  whenComposed(videoId: string): Promise<void>;
  handleGenerated: SucceededHandler;
};

export function createClipService(deps: {
  db: AppDatabase;
  clock: Clock;
  workflows: WorkflowConfig;
  prompts: ReadonlyMap<string, PromptFile>;
  plans: PlanService;
  characters: CharacterService;
  frames: FrameService;
  generation: FrameGeneration | null;
  store: AssetStore;
  ffmpeg: Ffmpeg;
  unavailableMessage?: string;
}): ClipService {
  void deps;
  const notYet = (): never => {
    throw new Error('尚未實作');
  };
  return {
    get: notYet,
    generate: async () => notYet(),
    invalidate: notYet,
    clipOf: notYet,
    whenComposed: async () => notYet(),
    handleGenerated: notYet,
  };
}
