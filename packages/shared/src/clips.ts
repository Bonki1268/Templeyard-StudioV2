import { z } from 'zod';
import { FRAME_STATES } from './frames.js';

// 分鏡影片與成品（F15；05「clips、finals」）：每格以確認的精緻圖為首格生成影片，全部完成後在本機合成成品

/** 偏差比對：關鍵畫格的時間點與相似度（0～1） */
export const keyframeSimilaritySchema = z.object({ atSec: z.number(), score: z.number().min(0).max(1) });
export type KeyframeSimilarity = z.infer<typeof keyframeSimilaritySchema>;

export const clipSchema = z.object({
  id: z.string(),
  shotKey: z.string(),
  assetId: z.string().nullable(),
  state: z.enum(FRAME_STATES),
  error: z.string().nullable(),
  selected: z.boolean(),
  needsReconfirm: z.boolean(),
  similarity: z.array(keyframeSimilaritySchema),
  createdAt: z.string(),
});
export type Clip = z.infer<typeof clipSchema>;

export const finalSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  subtitleAssetId: z.string().nullable(),
  durationSec: z.number(),
  width: z.number().int(),
  height: z.number().int(),
  fps: z.number(),
  /** 燒錄的字幕，依出現順序 */
  subtitles: z.array(z.string()),
  needsReconfirm: z.boolean(),
  createdAt: z.string(),
});
export type Final = z.infer<typeof finalSchema>;

export const clipsResponseSchema = z.object({
  /** 影片生成或合成中 */
  generating: z.boolean(),
  generatingLabel: z.string().nullable(),
  shots: z.array(z.object({ shotKey: z.string(), seq: z.number().int(), clip: clipSchema.nullable() })),
  final: finalSchema.nullable(),
  /** 合成失敗的原因（例如 FFmpeg 錯誤）；沒有失敗時是 null */
  composeError: z.string().nullable(),
});
export type ClipsResponse = z.infer<typeof clipsResponseSchema>;

/** POST /api/videos/:id/generate/clips */
export const generateClipsSchema = z.object({ consentToken: z.string({ error: '同意憑證格式不正確' }).optional() });

/** 生成中面板的內容類型：「影片・4 格」 */
export function clipGeneratingLabel(shotCount: number): string {
  void shotCount;
  throw new Error('尚未實作');
}

/** 要生成幾秒：卡片秒數低於模型最短長度時生成最短長度（合成時再從頭裁到卡片秒數），超過最長長度時用最長長度 */
export function generatedClipSec(durationSec: number, range: { min?: number | undefined; max?: number | undefined } = {}): number {
  void durationSec;
  void range;
  throw new Error('尚未實作');
}

/**
 * 軟性控制（Gemini、Seedance）的關鍵畫格時間軸，寫進影片指令：
 * 「0～3 秒：第 3 秒的畫面接近關鍵畫格 1；3～8 秒：停在末格」
 */
export function keyframeTimeline(durationSec: number, keyframeTimes: readonly number[]): string {
  void durationSec;
  void keyframeTimes;
  throw new Error('尚未實作');
}

/** 成品字幕：依卡片順序與秒數排出每一句的起訖時間；字幕欄空白的格子不出字幕 */
export type SubtitleEvent = { startSec: number; endSec: number; text: string };

export function subtitleEvents(shots: readonly { durationSec: number; subtitle: string }[]): SubtitleEvent[] {
  void shots;
  throw new Error('尚未實作');
}

/** ASS 的時間格式：H:MM:SS.cc */
export function assTime(sec: number): string {
  void sec;
  throw new Error('尚未實作');
}

/** 產生 ASS 字幕檔（02：Noto Sans TC、下方置中、白字；1920×1080） */
export function buildAss(events: readonly SubtitleEvent[], options: { font?: string } = {}): string {
  void events;
  void options;
  throw new Error('尚未實作');
}

/** 從 ASS 取回每一句字幕的文字（\N 換回換行） */
export function assDialogues(ass: string): string[] {
  void ass;
  throw new Error('尚未實作');
}

/** 偏差比對的相似度：兩張同樣大小的灰階畫面，1 減去平均像素差（0～1，取到小數第 2 位） */
export function grayscaleSimilarity(a: Uint8Array, b: Uint8Array): number {
  void a;
  void b;
  throw new Error('尚未實作');
}
