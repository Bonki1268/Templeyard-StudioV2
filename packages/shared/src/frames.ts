import { z } from 'zod';

// 精緻圖（01 F14、05 frames）與確認失效規則（03「確認失效規則」）

export const FRAME_KINDS = ['first', 'last', 'keyframe'] as const;
export type FrameKind = (typeof FRAME_KINDS)[number];

export const FRAME_STATES = ['generating', 'ready', 'failed'] as const;

/** 「生成影片」在第 11 階段才開放 */
export const CLIPS_NOT_OPEN = '影片生成將在之後的版本開放';

export const frameSchema = z.object({
  id: z.string(),
  shotKey: z.string(),
  kind: z.enum(FRAME_KINDS),
  atSec: z.number().nullable(),
  assetId: z.string().nullable(),
  state: z.enum(FRAME_STATES),
  error: z.string().nullable(),
  /** 使用者確認了這張（05 selected） */
  selected: z.boolean(),
  needsReconfirm: z.boolean(),
  createdAt: z.string(),
});
export type Frame = z.infer<typeof frameSchema>;

/** 一格的精緻圖：目前的首格與末格（最近一次產生的） */
export const shotFramesSchema = z.object({
  shotKey: z.string(),
  seq: z.number().int(),
  first: frameSchema.nullable(),
  last: frameSchema.nullable(),
  /** 這一格要不要末格（開啟中間關鍵畫格時） */
  needsLast: z.boolean(),
});
export type ShotFrames = z.infer<typeof shotFramesSchema>;

export const FRAME_SHOT_STATES = ['generating', 'failed', 'pending_confirm', 'needs_reconfirm', 'confirmed', 'missing'] as const;
export type FrameShotState = (typeof FRAME_SHOT_STATES)[number];

export const FRAME_SHOT_STATE_LABELS: Record<FrameShotState, string> = {
  generating: '生成中',
  failed: '生成失敗',
  pending_confirm: '待確認',
  needs_reconfirm: '需重新確認',
  confirmed: '已確認',
  missing: '還沒產生',
};

/** GET /api/videos/:id/frames */
export const framesResponseSchema = z.object({
  /** 有任何精緻圖還在生成 */
  generating: z.boolean(),
  /** 生成中面板顯示的內容類型，例如「精緻圖・4 格」；沒有在生成時為 null */
  generatingLabel: z.string().nullable(),
  shots: z.array(shotFramesSchema),
});
export type FramesResponse = z.infer<typeof framesResponseSchema>;

export const generateFramesSchema = z.object({ consentToken: z.string().optional() });
export const regenerateFrameSchema = z.object({
  kind: z.enum(['first', 'last'], { error: '請指定首格或末格' }).default('first'),
  consentToken: z.string().optional(),
});

/** GET /api/videos/:id/events 的事件：精緻圖生成狀態 */
export const videoEventSchema = z.object({ type: z.literal('frames'), generating: z.boolean(), generatingLabel: z.string().nullable() });
export type VideoEvent = z.infer<typeof videoEventSchema>;

/** 一格的狀態：首格（需要時加末格）都確認、沒有需重新確認才算確認 */
export function frameShotState(_shot: Pick<ShotFrames, 'first' | 'last' | 'needsLast'>): FrameShotState {
  throw new Error('尚未實作');
}

/** 「生成影片」旁列出的原因：還沒確認或需重新確認的格子，加上影片生成還沒開放 */
export function clipBlockers(_shots: readonly Pick<ShotFrames, 'seq' | 'first' | 'last' | 'needsLast'>[]): string[] {
  throw new Error('尚未實作');
}

/** 生成中面板的內容類型：「精緻圖・4 格」 */
export function generatingLabel(_shotCount: number): string {
  throw new Error('尚未實作');
}

// ── 確認失效規則（03 App Flow 的對照表） ──

/** 被修改的東西 */
export type InvalidationChange =
  /** 寺廟定裝版有新版本：用到這些視角的格子 */
  | { type: 'templeBoard'; viewKeys: readonly string[] }
  /** 角色定裝版改了：這個角色出現的格子 */
  | { type: 'character'; characterName: string }
  /** 分鏡卡片內容、秒數、參考素材改了 */
  | { type: 'shot'; shotKey: string; durationChanged: boolean }
  /** 首格精緻圖換了 */
  | { type: 'firstFrame'; shotKey: string }
  /** 任一格影片換了 */
  | { type: 'clip'; shotKey: string };

/** 失效的確認：哪幾格的精緻圖、關鍵畫格、影片，以及成品 */
export type Invalidated = { frames: string[]; keyframes: string[]; clips: string[]; final: boolean };

/**
 * 依 03 的對照表算出失效的確認：
 * - 寺廟定裝版（新版本）→ 用到該視角的精緻圖、關鍵畫格、影片
 * - 角色定裝版 → 該角色出現的所有格的精緻圖、關鍵畫格、影片
 * - 分鏡卡片內容、秒數、參考素材 → 該格的精緻圖、關鍵畫格、影片；秒數變動時成品
 * - 首格精緻圖 → 該格的中間關鍵畫格與影片
 * - 任一格影片 → 成品
 */
export function invalidatedBy(
  _change: InvalidationChange,
  _shots: readonly { shotKey: string; viewKey: string; characters: readonly string[] }[],
): Invalidated {
  throw new Error('尚未實作');
}

/** 方案改版時的失效：內容不同或秒數不同的格子（新增的格子沒有精緻圖，不算） */
export function planChangeInvalidations(
  _previous: readonly { shotKey: string; durationSec: number }[],
  _next: readonly { shotKey: string; durationSec: number }[],
  _changedShotKeys: readonly string[],
): InvalidationChange[] {
  throw new Error('尚未實作');
}
