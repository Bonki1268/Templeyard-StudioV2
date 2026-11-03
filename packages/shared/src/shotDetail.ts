import { z } from 'zod';
import { frameSchema } from './frames.js';
import { MAX_VIDEO_SEC, SHOT_SIZES, shotSchema } from './plans.js';

// 分鏡細修（01 F12、F13；規格書「分鏡細修」「5b. 中間關鍵畫格」；03「/videos/:vid/shots/:shotKey」）

export const MAX_KEYFRAMES = 4;
export const CAMERA_ANGLES = ['平視', '仰角', '俯角'] as const;

/** 中間關鍵畫格的使用提醒（規格書 5b「使用提醒」） */
export const KEYFRAME_REMINDER =
  '給首尾畫格時，中間的動作由模型補上，不保證一定發生。如果某個動作是這一格存在的理由，建議拆成獨立一格，或讓它落在首格或末格。';

/** 各影片模型的中間關鍵畫格控制方式（規格書 5b：Gemini、Seedance 軟性控制；Wan 精準控制） */
export const KEYFRAME_CONTROL: Record<string, '軟性控制' | '精準控制'> = {
  'gemini-omni-1.1-flash': '軟性控制',
  'seedance-2.0': '軟性控制',
  'wan-2.2': '精準控制',
};

/** 解析輸入框的時間點：「3、6」或「3,6」；不是數字時回傳錯誤 */
export function parseKeyframeTimes(text: string): { times: number[] } | { error: string } {
  const parts = text
    .split(/[、,，\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const times = parts.map(Number);
  if (times.some((value) => !Number.isFinite(value))) return { error: '時間點要是數字，以「、」分開' };
  return { times };
}

/**
 * 時間點規則（規格書 5b）：介於 0 秒與這一格長度之間（不含兩端）、彼此至少相隔 1 秒、最多 4 張；
 * 通過時回傳 null
 */
export function keyframeTimesError(times: readonly number[], durationSec: number): string | null {
  if (times.length === 0) return '請至少設定一個時間點';
  if (times.length > MAX_KEYFRAMES) return `中間關鍵畫格最多 ${MAX_KEYFRAMES} 張`;
  if (times.some((t) => t <= 0 || t >= durationSec)) return `時間點要介於 0 秒與 ${durationSec} 秒之間`;
  const sorted = [...times].sort((a, b) => a - b);
  // 浮點誤差：3 與 4 相隔剛好 1 秒要算通過
  if (sorted.some((t, i) => i > 0 && t - (sorted[i - 1] ?? 0) < 1 - 1e-9)) return '時間點彼此至少相隔 1 秒';
  return null;
}

/** 建議時間點：方案已有建議（Agent 依動作轉折給的）且符合規則就用；否則取這一格的中間（四捨五入到整秒） */
export function suggestKeyframeTimes(shot: { durationSec: number; keyframeTimes: readonly number[] }): number[] {
  if (shot.keyframeTimes.length > 0 && keyframeTimesError(shot.keyframeTimes, shot.durationSec) === null) return [...shot.keyframeTimes];
  if (shot.durationSec < 2) return [];
  return [Math.round(shot.durationSec / 2)];
}

/** 「Gemini Omni 1.1 Flash：中間關鍵畫格為軟性控制」 */
export function keyframeControlNote(videoModelKey: string, videoModelLabel: string): string {
  return `${videoModelLabel}：中間關鍵畫格為${KEYFRAME_CONTROL[videoModelKey] ?? '軟性控制'}`;
}

/** 細修頁儲存這一格：只送改到的欄位 */
export const shotPatchSchema = z
  .object({
    durationSec: z.number({ error: '秒數要是數字' }).int('秒數要是整數').min(1, '每格至少 1 秒').max(MAX_VIDEO_SEC, `每格最多 ${MAX_VIDEO_SEC} 秒`),
    shotSize: z.enum(SHOT_SIZES, { error: '請從遠景、中景、特寫選擇' }),
    cameraMove: z.string().max(40),
    cameraSpeed: z.string().max(40),
    cameraAngle: z.string().max(40),
    description: z.string().max(1000),
    actionStart: z.string().max(500),
    actionEnd: z.string().max(500),
    viewKey: z.string().max(80),
    lighting: z.string().max(200),
    characters: z.array(z.string().max(40)).max(10),
    dialogue: z.string().max(500),
    speaker: z.string().max(40),
    subtitle: z.string().max(500),
    photoId: z.string().nullable(),
    keyframesEnabled: z.boolean(),
    keyframeTimes: z.array(z.number()).max(MAX_KEYFRAMES, `中間關鍵畫格最多 ${MAX_KEYFRAMES} 張`),
    customPrompt: z.string().max(4000).nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { error: '沒有要修改的欄位' });
export type ShotPatch = z.infer<typeof shotPatchSchema>;

/** 圈選範圍：左、上、寬、高，都是畫面的比例（0～1） */
export const regionBoxSchema = z
  .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
  .refine((box) => box.width > 0 && box.height > 0, { error: '圈選範圍不能是空的' })
  .refine((box) => box.x >= 0 && box.y >= 0 && box.x + box.width <= 1 && box.y + box.height <= 1, { error: '圈選範圍要在畫面之內' });
export type RegionBox = z.infer<typeof regionBoxSchema>;

export const regionEditSchema = z.object({
  box: regionBoxSchema,
  instruction: z.string({ error: '請說明要怎麼改這一處' }).trim().min(1, '請說明要怎麼改這一處').max(500),
  consentToken: z.string().optional(),
});
export type RegionEditInput = z.input<typeof regionEditSchema>;

/** 上傳自己的首格或末格：瀏覽器去識別後的圖 */
export const uploadFrameSchema = z.object({
  kind: z.enum(['first', 'last'], { error: '請指定首格或末格' }),
  mime: z.enum(['image/png', 'image/jpeg'], { error: '請上傳 PNG 或 JPEG 圖片' }),
  dataBase64: z.string().min(1, '沒有圖片內容'),
});

/** 圈選範圍寫成指令用的文字：「左 10%、上 20%、寬 30%、高 40%」 */
export function regionText(box: RegionBox): string {
  const pct = (value: number) => `${Math.round(value * 100)}%`;
  return `左 ${pct(box.x)}、上 ${pct(box.y)}、寬 ${pct(box.width)}、高 ${pct(box.height)}`;
}

/** GET /api/videos/:id/shots/:shotKey */
export const shotDetailSchema = z.object({
  shot: shotSchema,
  first: frameSchema.nullable(),
  last: frameSchema.nullable(),
  keyframes: z.array(frameSchema),
  /** 這一格產生過的所有圖（依產生順序），可以選回舊的 */
  versions: z.array(frameSchema.extend({ editOfFrameId: z.string().nullable(), userUploaded: z.boolean() })),
  /** 最近一次送出的生成指令（還沒生成時為 null） */
  lastPrompt: z.string().nullable(),
  keyframeControl: z.string(),
  totalSec: z.number(),
  targetSec: z.number(),
});
export type ShotDetail = z.infer<typeof shotDetailSchema>;
