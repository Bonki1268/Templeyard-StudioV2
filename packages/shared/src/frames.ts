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
export function frameShotState(shot: Pick<ShotFrames, 'first' | 'last' | 'needsLast'>): FrameShotState {
  const parts = shot.needsLast ? [shot.first, shot.last] : [shot.first];
  if (parts.some((frame) => frame === null)) return 'missing';
  const present = parts.filter((frame): frame is Frame => frame !== null);
  if (present.some((frame) => frame.state === 'generating')) return 'generating';
  if (present.some((frame) => frame.state === 'failed')) return 'failed';
  if (present.some((frame) => frame.needsReconfirm)) return 'needs_reconfirm';
  if (present.every((frame) => frame.selected)) return 'confirmed';
  return 'pending_confirm';
}

/** 「生成影片」旁列出的原因：還沒確認或需重新確認的格子，加上影片生成還沒開放 */
const CLIP_BLOCKER_TEXT: Partial<Record<FrameShotState, string>> = {
  missing: '還沒有精緻圖',
  generating: '精緻圖還在生成中',
  failed: '精緻圖生成失敗，請重生',
  pending_confirm: '精緻圖還沒確認',
  needs_reconfirm: '精緻圖需重新確認',
};

export function clipBlockers(shots: readonly Pick<ShotFrames, 'seq' | 'first' | 'last' | 'needsLast'>[]): string[] {
  const reasons = shots.flatMap((shot) => {
    const text = CLIP_BLOCKER_TEXT[frameShotState(shot)];
    return text ? [`第 ${shot.seq} 格：${text}`] : [];
  });
  return [...reasons, CLIPS_NOT_OPEN];
}

/** 生成中面板的內容類型：「精緻圖・4 格」 */
export function generatingLabel(shotCount: number): string {
  return `精緻圖・${shotCount} 格`;
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
  change: InvalidationChange,
  shots: readonly { shotKey: string; viewKey: string; characters: readonly string[] }[],
): Invalidated {
  const none: Invalidated = { frames: [], keyframes: [], clips: [], final: false };
  const all = (keys: string[]): Invalidated => ({ frames: keys, keyframes: keys, clips: keys, final: false });
  switch (change.type) {
    case 'templeBoard':
      return all(shots.filter((shot) => change.viewKeys.includes(shot.viewKey)).map((shot) => shot.shotKey));
    case 'character':
      return all(shots.filter((shot) => shot.characters.includes(change.characterName)).map((shot) => shot.shotKey));
    case 'shot':
      return { ...all([change.shotKey]), final: change.durationChanged };
    case 'firstFrame':
      return { ...none, keyframes: [change.shotKey], clips: [change.shotKey] };
    case 'clip':
      return { ...none, final: true };
  }
}

/** 方案改版時的失效：內容不同或秒數不同的格子（新增的格子沒有精緻圖，不算） */
export function planChangeInvalidations(
  previous: readonly { shotKey: string; durationSec: number }[],
  next: readonly { shotKey: string; durationSec: number }[],
  changedShotKeys: readonly string[],
): InvalidationChange[] {
  const before = new Map(previous.map((shot) => [shot.shotKey, shot.durationSec]));
  return next.flatMap((shot): InvalidationChange[] => {
    const old = before.get(shot.shotKey);
    if (old === undefined || !changedShotKeys.includes(shot.shotKey)) return [];
    return [{ type: 'shot', shotKey: shot.shotKey, durationChanged: old !== shot.durationSec }];
  });
}
