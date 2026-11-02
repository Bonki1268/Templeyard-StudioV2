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
  /** 這個場景透過 API 建立的影片，依建立順序；最後一支是「這支影片」 */
  videoIds?: string[];
  /** 最後一次上傳的照片檔名（e2e/fixtures/photos/ 底下） */
  uploadedFiles?: string[];
  /** 定裝版產生完成時，各視角（名稱）的視角圖編號；用來判斷重生後換了圖 */
  boardAssets?: Record<string, string | null>;
};

export const test = base.extend<{ state: ScenarioState }>({
  // Playwright fixture 的第一個參數必須是解構寫法
  // eslint-disable-next-line no-empty-pattern
  state: async ({}, use) => {
    await use({});
  },
});

export const { Given, When, Then } = createBdd(test);
