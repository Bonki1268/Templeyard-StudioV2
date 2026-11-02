import { expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';
import { Given, Then, When } from './fixtures';

// Prompt Studio（prompt-studio/server.js）：情境測試啟動在 3301，使用 prompts 的複本（見 playwright.config.ts）
const STUDIO = 'http://127.0.0.1:3301';

type StudioPrompt = {
  id: string;
  version: number;
  template: string;
  bindings?: Record<string, string>;
  modelRules?: Record<string, string>;
} & Record<string, unknown>;

type State = { studioResponse?: APIResponse; studioPrompt?: StudioPrompt };

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function readPrompt(request: APIRequestContext, id: string): Promise<StudioPrompt> {
  const response = await request.get(`${STUDIO}/api/prompts/${id}`);
  expect(response.status()).toBe(200);
  return ((await response.json()) as { prompt: StudioPrompt }).prompt;
}

/** 讓這份 prompt 變成某種不合法的樣子 */
function breakPrompt(prompt: StudioPrompt, situation: string): StudioPrompt {
  const bindings = prompt.bindings ?? {};
  switch (situation) {
    case '綁定到工作流程裡不存在的位置':
      return { ...prompt, bindings: { ...bindings, frameCount: 'view.key' } };
    case '綁定的資料沒有宣告':
      return { ...prompt, bindings: { ...bindings, prompt: 'shot.unknown' } };
    case '圖片節點綁定了秒數':
      return { ...prompt, bindings: { ...bindings, durationSec: 'view.key' } };
    case '文字節點有呼叫綁定':
      return { ...prompt, bindings: { prompt: 'story' } };
    case '指令用到未宣告的變數':
      return { ...prompt, template: '{{unknown.var}}' };
    default:
      throw new Error(`沒有定義這種錯誤資料：${situation}`);
  }
}

// ── API ──

When(/^我透過 Prompt Studio 讀取「(.+)」$/, async ({ request, state }, id: string) => {
  (state as State).studioPrompt = await readPrompt(request, id);
});

Then(/^呼叫綁定把「(.+)」對應到「(.+)」$/, async ({ state }, slot: string, source: string) => {
  const prompt = (state as State).studioPrompt;
  if (!prompt) throw new Error('還沒有讀取 prompt');
  expect(prompt.bindings?.[slot]).toBe(source);
});

When(/^我透過 Prompt Studio 儲存「(.+)」，但(.+)$/, async ({ request, state }, id: string, situation: string) => {
  const prompt = await readPrompt(request, id);
  (state as State).studioResponse = await request.put(`${STUDIO}/api/prompts/${id}`, {
    data: { prompt: breakPrompt(prompt, situation), expectedVersion: prompt.version },
  });
});

Then(/^Prompt Studio 回應 (\d+)，說明包含「(.+)」$/, async ({ state }, status: string, message: string) => {
  const response = (state as State).studioResponse;
  if (!response) throw new Error('還沒有送出請求');
  expect(response.status()).toBe(Number(status));
  const body = (await response.json()) as { error: { details?: string[] } };
  expect(body.error.details ?? []).toContain(message);
});

Then(/^透過 Prompt Studio 讀取「(.+)」時，「(.+)」的模型寫法是「(.+)」$/, async ({ request }, id: string, model: string, rule: string) => {
  expect((await readPrompt(request, id)).modelRules?.[model]).toBe(rule);
});

// ── 管理頁 ──

function editor(page: Page) {
  return page.getByRole('main');
}

Given(/^我打開 Prompt Studio 的「(.+)」$/, async ({ page }, name: string) => {
  await page.goto(`${STUDIO}/`);
  await page
    .getByRole('navigation', { name: 'Prompt 清單' })
    .getByRole('button', { name: new RegExp(`^${escapeRegExp(name)}`) })
    .click();
  await expect(editor(page).getByRole('heading', { name, exact: true })).toBeVisible();
});

Then(/^呼叫綁定「(.+)」的欄位是「(.+)」$/, async ({ page }, slot: string, value: string) => {
  await expect(page.getByLabel(`呼叫綁定 ${slot}`, { exact: true })).toHaveValue(value);
});

When(/^我把呼叫綁定「(.+)」改成「(.+)」$/, async ({ page }, slot: string, value: string) => {
  await page.getByLabel(`呼叫綁定 ${slot}`, { exact: true }).fill(value);
});

When(/^我把「(.+)」的模型寫法改成「(.+)」$/, async ({ page }, model: string, rule: string) => {
  await page.getByLabel(`模型寫法：${model}`, { exact: true }).fill(rule);
});

When(/^我在 Prompt Studio 按下「(.+)」$/, async ({ page }, name: string) => {
  await page.getByRole('button', { name, exact: true }).click();
});

Then(/^Prompt Studio 顯示「(.+)」$/, async ({ page }, text: string) => {
  await expect(page.getByText(new RegExp(escapeRegExp(text))).first()).toBeVisible();
});

Then(/^預覽的「(.+)」列出「(.+)」$/, async ({ page }, list: string, item: string) => {
  await expect(page.getByRole('list', { name: list }).getByText(item, { exact: true })).toBeVisible();
});
