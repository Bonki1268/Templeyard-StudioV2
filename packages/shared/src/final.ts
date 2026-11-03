import { z } from 'zod';

// 成品面板（F16）與複製影片（F17）

/** 成品面板的各格縮圖：每格的開始秒數與佔全片的比例（縮圖寬度依秒數比例） */
export type ThumbnailItem = { seq: number; shotKey: string; startSec: number; durationSec: number; ratio: number };

export function thumbnailStrip(shots: readonly { seq: number; shotKey: string; durationSec: number }[]): ThumbnailItem[] {
  void shots;
  throw new Error('尚未實作');
}

/** 下載的檔名：「寺廟名稱-YYYY-MM-DD.mp4」；檔名不能用的字元換成「-」 */
export function downloadFileName(templeName: string, createdAt: string): string {
  void templeName;
  void createdAt;
  throw new Error('尚未實作');
}

/** 成品不能確認的原因 */
export const NO_FINAL_MESSAGE = '還沒有成品';
export const FINAL_STALE_MESSAGE = '成品需重新確認，請重新生成影片';

/** Agent 工具 schedule_regeneration 的輸入：要重生的格子序號與調整指令 */
export const scheduleRegenerationInputSchema = z.object({
  shots: z.array(z.number().int().positive()).min(1).max(30),
  instruction: z.string().trim().min(1).max(500),
});
export type ScheduleRegenerationInput = z.infer<typeof scheduleRegenerationInputSchema>;
