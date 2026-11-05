import type { APIResponse } from '@playwright/test';
import type { TempleSummary } from '@templeyard/shared';
import { test as base, createBdd } from 'playwright-bdd';

// 同一個場景裡，步驟之間共用的狀態。
type ScenarioState = {
  lastResponse?: APIResponse;
  temples?: TempleSummary[];
  matched?: TempleSummary[];
  /** 這個場景建立的系列（名稱每次不同，避免和其他場景衝突） */
  seriesName?: string;
  seriesId?: string;
  /** 這個系列的影片用過的寺廟（使用者 2026-11-05 提出：卡片的寺廟標籤） */
  seriesTemples?: string[];
  /** 這個場景透過 API 建立的影片，依建立順序；最後一支是「這支影片」 */
  videoIds?: string[];
  /** 最後一次上傳的照片檔名（e2e/fixtures/photos/ 底下） */
  uploadedFiles?: string[];
  /** 定裝版產生完成時，各視角（名稱）的視角圖編號；用來判斷重生後換了圖 */
  boardAssets?: Record<string, string | null>;
  /** 畫面上最近一次顯示的 AI 建議 */
  aiSuggestion?: string;
  /** 透過 API 產生的 AI 輔助撰寫紀錄 */
  assistLogId?: string;
  /** 確認精緻圖時記下每格首格的檔案編號（依序號） */
  frameAssets?: Record<number, string | null>;
  /** 產生成品時記下的成品與各格影片（第 12 階段） */
  finalId?: string | null;
  clipIds?: (string | null)[];
  /** 複製出來的新影片（第 12 階段） */
  copiedVideoId?: string;
  /** 第 14 階段：系列頁的角色詳情與版本、另一個系列的角色 */
  characterId?: string;
  otherCharacterId?: string;
  characterAssets?: { sheet: string | null; look: string | null };
  /** 「確認並下載」下載到的檔案（第 12 階段） */
  downloaded?: { filename: string; bytes: Buffer };
};

export const test = base.extend<{ state: ScenarioState }>({
  // Playwright fixture 的第一個參數必須是解構寫法
  // eslint-disable-next-line no-empty-pattern
  state: async ({}, use) => {
    await use({});
  },
});

export const { Given, When, Then } = createBdd(test);
