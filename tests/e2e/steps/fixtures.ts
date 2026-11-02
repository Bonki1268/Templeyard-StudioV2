import type { APIResponse } from '@playwright/test';
import type { TempleSummary } from '@templeyard/shared';
import { test as base, createBdd } from 'playwright-bdd';

// 同一個場景裡，步驟之間共用的狀態。
type ScenarioState = {
  lastResponse?: APIResponse;
  temples?: TempleSummary[];
  matched?: TempleSummary[];
};

export const test = base.extend<{ state: ScenarioState }>({
  // Playwright fixture 的第一個參數必須是解構寫法
  // eslint-disable-next-line no-empty-pattern
  state: async ({}, use) => {
    await use({});
  },
});

export const { Given, When, Then } = createBdd(test);
