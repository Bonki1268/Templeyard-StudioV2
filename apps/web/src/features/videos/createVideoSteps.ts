import type { CostEstimate } from '@templeyard/shared';
import { pendingMessage } from '../series/seriesForm';

// 建立影片頁的步驟列與待處理項目（純函式）

export const CREATE_VIDEO_STEPS = ['選擇寺廟', '選擇模型', '上傳照片', '寺廟定裝版'] as const;
export type CreateVideoStep = (typeof CREATE_VIDEO_STEPS)[number];

/** plannedViewCount：照片指定的視角加上讓 AI 推測的視角，共要產生幾張 */
export type CreateVideoProgress = { hasVideo: boolean; photoCount: number; plannedViewCount: number };

/** 目前在哪一步：還沒選寺廟 → 選擇寺廟；還沒有照片 → 上傳照片；有照片 → 寺廟定裝版（模型有系列預設，不會停在選擇模型） */
export function currentStep(progress: CreateVideoProgress): CreateVideoStep {
  if (!progress.hasVideo) return '選擇寺廟';
  if (progress.photoCount === 0) return '上傳照片';
  return '寺廟定裝版';
}

/** 產生寺廟定裝版之前還要做的事（第 5 階段：還要有要產生的視角，綠燈實作） */
export function pendingItems(progress: CreateVideoProgress): string[] {
  const items: string[] = [];
  if (!progress.hasVideo) items.push('選擇寺廟');
  if (progress.photoCount === 0) items.push('上傳至少 1 張照片');
  return items;
}

/** 產生寺廟定裝版在第 5 階段才開放（綠燈時拿掉） */
export const TEMPLE_BOARD_NOT_YET = '產生寺廟定裝版將在之後的版本開放';

/** 「產生寺廟定裝版」旁的費用預估；estimate 為 null 表示還在預估 */
export function boardEstimateText(_viewCount: number, _modelLabel: string, _estimate: CostEstimate | null): string {
  throw new Error('尚未實作');
}

/** 底部操作列的說明：有待處理就列出來，沒有就顯示費用預估（綠燈實作：目前仍說明還沒開放） */
export function bottomNote(progress: CreateVideoProgress, _estimateText: string): string {
  const items = pendingItems(progress);
  return items.length > 0 ? pendingMessage(items) : TEMPLE_BOARD_NOT_YET;
}
