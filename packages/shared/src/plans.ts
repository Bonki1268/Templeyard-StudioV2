import { z } from 'zod';

// 分鏡方案與卡片（01 F8、F9；05 plans、shots；規格書「5. 分鏡方案」）

export const SHOT_SIZES = ['遠景', '中景', '特寫'] as const;
export type ShotSize = (typeof SHOT_SIZES)[number];

/** 運鏡的常用選項；Claude 也可能寫其他文字，畫面照樣顯示 */
export const CAMERA_MOVES = ['固定', '推', '拉', '搖'] as const;

export const PLAN_SOURCES = ['agent', 'user_edit', 'chat_edit', 'revert'] as const;
export type PlanSource = (typeof PLAN_SOURCES)[number];

/** 影片長度上限（01：成品 30 秒以內） */
export const MAX_VIDEO_SEC = 30;

/** 對白估時：各模型語速實測前暫以每秒約 4 字估算（規格書「秒數檢查」），標示「暫估」 */
export const SPEECH_RATE_CHARS_PER_SEC = 4;
/** 開口前與說完後的停頓（story-script 指令：開口前約 0.5 秒、說完後約 0.5～1 秒，取下限） */
export const DIALOGUE_PAUSE_BEFORE_SEC = 0.5;
export const DIALOGUE_PAUSE_AFTER_SEC = 0.5;

/** 「生成」在第 9 階段才開放 */
export const FRAMES_NOT_OPEN = '精緻圖生成將在之後的版本開放';

export const shotSchema = z.object({
  /** 跨版本不變的格子識別碼 */
  shotKey: z.string(),
  seq: z.number().int().positive(),
  startSec: z.number().nonnegative(),
  durationSec: z.number().int().positive(),
  shotSize: z.enum(SHOT_SIZES),
  cameraMove: z.string(),
  cameraSpeed: z.string(),
  cameraAngle: z.string(),
  description: z.string(),
  actionStart: z.string(),
  actionEnd: z.string(),
  /** 寺廟定裝版的視角；定裝版沒有時是「missing:視角名稱」 */
  viewKey: z.string(),
  lighting: z.string(),
  /** 出現的角色（第 8 階段建立角色後改存角色編號） */
  characters: z.array(z.string()),
  dialogue: z.string(),
  speaker: z.string(),
  subtitle: z.string(),
  photoId: z.string().nullable(),
  keyframesEnabled: z.boolean(),
  keyframeTimes: z.array(z.number()),
  customPrompt: z.string().nullable(),
  factSources: z.array(z.string()),
  dialogueEstimateSec: z.number().nullable(),
});
export type Shot = z.infer<typeof shotSchema>;

/** 這一版和上一版的差異 */
export const planDiffSchema = z.object({
  changedShotKeys: z.array(z.string()),
  summary: z.string(),
  /** 回到舊版時，回到第幾版 */
  revertedFrom: z.number().int().optional(),
});
export type PlanDiff = z.infer<typeof planDiffSchema>;

export const planSchema = z.object({
  id: z.string(),
  videoId: z.string(),
  version: z.number().int().positive(),
  styleNote: z.string(),
  source: z.enum(PLAN_SOURCES),
  diff: planDiffSchema,
  createdAt: z.string(),
  shots: z.array(shotSchema),
});
export type Plan = z.infer<typeof planSchema>;

export const planVersionSummarySchema = z.object({
  version: z.number().int().positive(),
  source: z.enum(PLAN_SOURCES),
  diff: planDiffSchema,
  createdAt: z.string(),
});
export type PlanVersionSummary = z.infer<typeof planVersionSummarySchema>;

/** 秒數檢查需要的規則：目標長度、這支影片的影片模型最短生成長度（待實測時為 null） */
export const planRulesSchema = z.object({
  targetSec: z.number().int().positive(),
  minGenerationSec: z.number().positive().nullable(),
  videoModelLabel: z.string(),
});
export type PlanRules = z.infer<typeof planRulesSchema>;

/** GET /api/videos/:id/plan */
export const planResponseSchema = z.object({
  plan: planSchema.nullable(),
  versions: z.array(planVersionSummarySchema),
  rules: planRulesSchema,
  /** 寺廟定裝版的視角（場景卡與場景視角選單） */
  views: z.array(z.object({ viewKey: z.string(), viewName: z.string() })),
});
export type PlanResponse = z.infer<typeof planResponseSchema>;

export const planVersionResponseSchema = z.object({ plan: planSchema });

/** 修改方案時每一格的資料；沒有 shotKey 的是新的一格 */
export const shotInputSchema = z.object({
  shotKey: z.string().optional(),
  durationSec: z.number({ error: '每格的秒數要是數字' }).int('秒數要是整數').min(1, '每格至少 1 秒').max(MAX_VIDEO_SEC, `每格最多 ${MAX_VIDEO_SEC} 秒`),
  shotSize: z.enum(SHOT_SIZES, { error: '請從遠景、中景、特寫選擇' }),
  cameraMove: z.string().max(40).default('固定'),
  cameraSpeed: z.string().max(40).default(''),
  cameraAngle: z.string().max(40).default(''),
  description: z.string().max(1000).default(''),
  actionStart: z.string().max(500).default(''),
  actionEnd: z.string().max(500).default(''),
  viewKey: z.string().max(80).default(''),
  lighting: z.string().max(200).default(''),
  characters: z.array(z.string().max(40)).max(10).default([]),
  dialogue: z.string().max(500).default(''),
  speaker: z.string().max(40).default(''),
  subtitle: z.string().max(500).default(''),
  photoId: z.string().nullable().default(null),
  keyframesEnabled: z.boolean().default(false),
  keyframeTimes: z.array(z.number()).max(4).default([]),
  customPrompt: z.string().nullable().default(null),
  factSources: z.array(z.string()).default([]),
});
export type ShotInput = z.input<typeof shotInputSchema>;
export type ShotDraft = z.output<typeof shotInputSchema>;

/** POST /api/videos/:id/plan/versions：依最新版本修改（shots），或回到舊版（revertTo） */
export const createPlanVersionSchema = z
  .object({
    baseVersion: z.number({ error: '請指定根據哪一版修改' }).int().positive(),
    shots: z.array(shotInputSchema).min(1, '方案至少要有一格').optional(),
    styleNote: z.string().max(1000).optional(),
    revertTo: z.number().int().positive().optional(),
  })
  .refine((value) => (value.shots === undefined) !== (value.revertTo === undefined), { error: '請提供修改後的卡片，或要回到的版本' });
export type CreatePlanVersionInput = z.input<typeof createPlanVersionSchema>;

/** Agent 的 submit_plan 工具：story-script 節點的輸出格式（prompt-studio/prompts/story-script.json） */
export const planOutputSchema = z.object({
  title: z.string(),
  logline: z.string().optional(),
  styleNote: z.string(),
  characters: z
    .array(
      z.object({
        name: z.string().min(1),
        isSeriesCharacter: z.boolean().optional(),
        description: z.string().optional(),
        continuityLocks: z.array(z.string()).optional(),
      }),
    )
    .default([]),
  shots: z
    .array(
      z.object({
        seq: z.number().int(),
        durationSec: z.number().positive(),
        shotSize: z.enum(SHOT_SIZES),
        cameraMove: z.string(),
        cameraSpeed: z.string().optional(),
        cameraAngle: z.string().optional(),
        description: z.string().min(1),
        actionStart: z.string(),
        actionEnd: z.string().optional(),
        viewKey: z.string().min(1),
        lighting: z.string().optional(),
        characters: z.array(z.string()).optional(),
        dialogue: z.string().optional(),
        speaker: z.string().optional(),
        subtitle: z.string(),
        photoIndex: z.number().int().optional(),
        dialogueEstimateSec: z.number().optional(),
        keyframeSuggestions: z.array(z.number()).optional(),
        factSources: z.array(z.string()).optional(),
      }),
    )
    .min(1),
});
export type PlanOutput = z.infer<typeof planOutputSchema>;

/** Agent 的 revise_plan 工具：依序號修改幾格 */
export const revisePlanInputSchema = z.object({
  changes: z
    .array(
      z.object({
        seq: z.number().int().positive(),
        durationSec: z.number().int().min(1).max(MAX_VIDEO_SEC).optional(),
        shotSize: z.enum(SHOT_SIZES).optional(),
        cameraMove: z.string().optional(),
        description: z.string().optional(),
        actionStart: z.string().optional(),
        actionEnd: z.string().optional(),
        viewKey: z.string().optional(),
        dialogue: z.string().optional(),
        speaker: z.string().optional(),
        subtitle: z.string().optional(),
      }),
    )
    .min(1),
});
export type RevisePlanInput = z.infer<typeof revisePlanInputSchema>;

export class PlanInputError extends Error {
  override name = 'PlanInputError';
}

/** 秒數檢查的結果 */
export type ShotCheck = {
  /** 對白估時（暫估）；沒有台詞時為 null */
  dialogueEstimateSec: number | null;
  dialogueOverflow: boolean;
  /** 短於最短生成長度的提醒（不擋住生成） */
  shortWarning: string | null;
  /** 缺少的視角名稱（定裝版沒有） */
  missingView: string | null;
};

export type PlanCheck = {
  totalSec: number;
  targetSec: number;
  /** 還不能生成的原因（不含 FRAMES_NOT_OPEN） */
  blocking: string[];
  shots: Record<string, ShotCheck>;
};

/** 台詞要念的字數：只算文字與數字，不算標點與空白 */
export function countSpeechChars(_text: string): number {
  throw new Error('尚未實作');
}

/** 對白估時：字數 ÷ 語速＋開口前與說完後的停頓，無條件進位到 0.1 秒；沒有要念的字時為 null */
export function estimateDialogueSec(_text: string): number | null {
  throw new Error('尚未實作');
}

/** 「missing:後殿」→「後殿」；不是缺少的視角時為 null */
export function missingViewName(_viewKey: string): string | null {
  throw new Error('尚未實作');
}

/** 目標長度：問卷的「長度」（例如「20 秒」）優先，否則系列的影片秒數；都不超過 30 秒 */
export function planTargetSec(_lengthChoice: string | null, _seriesDurationSec: number): number {
  throw new Error('尚未實作');
}

/**
 * 秒數檢查（規格書「秒數檢查」與「確認條件」）：
 * - 總長度不超過目標長度，也不超過 30 秒
 * - 每格至少 1 秒；短於最短生成長度時提醒會裁切（不擋住）
 * - 對白估時超過這一格的秒數：對白放不下
 * - 每格要有畫面內容與場景視角；缺少視角要先補
 */
export function checkPlan(_shots: readonly Pick<Shot, 'shotKey' | 'seq' | 'durationSec' | 'description' | 'viewKey' | 'dialogue'>[], _rules: PlanRules): PlanCheck {
  throw new Error('尚未實作');
}

/** 「0:07」 */
export function formatClock(_sec: number): string {
  throw new Error('尚未實作');
}

/** 卡片標題：「3｜0:07–0:10（3 秒）」 */
export function shotTitle(_shot: Pick<Shot, 'seq' | 'startSec' | 'durationSec'>): string {
  throw new Error('尚未實作');
}

/** 依順序重算序號與開始秒數 */
export function withTimeline<T extends { durationSec: number }>(_shots: readonly T[]): (T & { seq: number; startSec: number })[] {
  throw new Error('尚未實作');
}

/**
 * 拖曳時間軸第 boundary 個邊界（第 boundary+1 格與下一格之間）：前一格加 delta 秒、後一格減 delta 秒；
 * 任一格不能短於 1 秒，超過時停在 1 秒
 */
export function moveBoundary(_durations: readonly number[], _boundary: number, _deltaSec: number): number[] {
  throw new Error('尚未實作');
}

/** Agent 產生的方案轉成卡片：秒數四捨五入到整數（至少 1 秒），依序號排序 */
export function shotsFromOutput(_output: PlanOutput): ShotDraft[] {
  throw new Error('尚未實作');
}

/** 對話修改：依序號套用修改；沒有這一格時丟出 PlanInputError「方案沒有第 N 格」 */
export function applyRevision(_shots: readonly ShotDraft[], _changes: RevisePlanInput['changes']): ShotDraft[] {
  throw new Error('尚未實作');
}

/**
 * 兩版之間改了哪幾格：內容不同或新增的格子；摘要例如「改了第 1、3 格」「刪除了 1 格」「調整了順序」，
 * 依新版本的序號；沒有改動時是「沒有改動」
 */
export function diffShots(_previous: readonly Shot[], _next: readonly Shot[]): PlanDiff {
  throw new Error('尚未實作');
}

/** 版本選單的文字：「第 2 版（手動修改）」「第 3 版（回到第 1 版）」 */
export function planVersionLabel(_version: Pick<PlanVersionSummary, 'version' | 'source' | 'diff'>): string {
  throw new Error('尚未實作');
}
