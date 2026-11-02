// 建立影片頁的步驟列與待處理項目（純函式）

export const CREATE_VIDEO_STEPS = ['選擇寺廟', '選擇模型', '上傳照片', '寺廟定裝版'] as const;
export type CreateVideoStep = (typeof CREATE_VIDEO_STEPS)[number];

export type CreateVideoProgress = { hasVideo: boolean; photoCount: number };

/** 目前在哪一步：還沒選寺廟 → 選擇寺廟；還沒有照片 → 上傳照片；有照片 → 寺廟定裝版（模型有系列預設，不會停在選擇模型） */
export function currentStep(_progress: CreateVideoProgress): CreateVideoStep {
  throw new Error('尚未實作');
}

/** 產生寺廟定裝版之前還要做的事 */
export function pendingItems(_progress: CreateVideoProgress): string[] {
  throw new Error('尚未實作');
}

/** 產生寺廟定裝版在第 5 階段才開放 */
export const TEMPLE_BOARD_NOT_YET = '產生寺廟定裝版將在之後的版本開放';

/** 底部操作列的說明：有待處理就列出來，沒有就說明還沒開放 */
export function bottomNote(_progress: CreateVideoProgress): string {
  throw new Error('尚未實作');
}
