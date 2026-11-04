import AxeBuilder from '@axe-core/playwright';
import { expect, type APIResponse, type Page } from '@playwright/test';
import { characterListResponseSchema, characterResponseSchema, templeSearchResponseSchema } from '@templeyard/shared';
import { Given, Then, When } from './fixtures';
import { createVideoViaApi, uniqueName } from './support/api';

// 系列卡片標籤、修改系列設定、系列角色庫（使用者 2026-11-05 提出）

type State = { seriesId?: string; seriesName?: string; seriesTemples?: string[]; videoIds?: string[]; lastResponse?: APIResponse };

function requireSeriesId(state: State): string {
  if (!state.seriesId) throw new Error('這個場景還沒有建立系列');
  return state.seriesId;
}

function seriesCard(page: Page, state: State) {
  if (!state.seriesName) throw new Error('這個場景還沒有建立系列');
  return page
    .getByRole('region', { name: '你的系列' })
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: state.seriesName, exact: true }) });
}

function library(page: Page) {
  return page.getByRole('region', { name: '角色庫', exact: true });
}

function libraryCharacter(page: Page, name: string) {
  return library(page).getByRole('article', { name: `角色：${name}`, exact: true });
}

// ── 系列卡片 ──

Given(/^我透過 API 為這個系列建立 (\d+) 支不同寺廟的影片$/, async ({ request, state }, count: string) => {
  const seriesId = requireSeriesId(state);
  const response = await request.get('/api/temples', { params: { q: '宮', limit: '20' } });
  expect(response.status()).toBe(200);
  const names = [...new Set(templeSearchResponseSchema.parse(await response.json()).temples.map((t) => t.name))].slice(0, Number(count));
  expect(names).toHaveLength(Number(count));
  for (const name of names) {
    const { response: created } = await createVideoViaApi(request, seriesId, name);
    expect(created.status()).toBe(201);
  }
  state.seriesTemples = names;
});

Then(/^這個系列的卡片有 (\d+) 個寺廟標籤$/, async ({ page, state }, count: string) => {
  const card = seriesCard(page, state);
  const temples = state.seriesTemples ?? [];
  await expect(card.getByRole('listitem').first()).toBeVisible({ timeout: 20_000 });
  let shown = 0;
  for (const name of temples) if ((await card.getByText(name, { exact: true }).count()) > 0) shown += 1;
  expect(shown).toBe(Number(count));
});

Then(/^這個系列的卡片沒有顯示「(.+)」$/, async ({ page, state }, text: string) => {
  const card = seriesCard(page, state);
  await expect(card).toBeVisible();
  await expect(card.getByText(text)).toHaveCount(0);
});

Then(/^我看不到「(.+)」的選項$/, async ({ page }, group: string) => {
  await expect(page.getByLabel('系列名稱')).toBeVisible();
  await expect(page.getByRole('group', { name: group })).toHaveCount(0);
});

// ── 修改系列設定 ──

When(/^我把「(.+)」清空$/, async ({ page }, label: string) => {
  await page.getByLabel(label, { exact: true }).fill('');
});

Then(/^系列設定的「(.+)」是「(.+)」$/, async ({ page }, term: string, value: string) => {
  const dt = page.getByRole('term').filter({ hasText: new RegExp(`^${term}$`) });
  await expect(dt).toBeVisible();
  await expect(dt.locator('xpath=following-sibling::dd[1]')).toHaveText(value);
});

// ── 角色庫 ──

Given(/^我已經透過 API 在這個系列的角色庫新增角色「(.+)」$/, async ({ request, state }, name: string) => {
  const response = await request.post(`/api/series/${requireSeriesId(state)}/characters`, {
    data: { name, description: '七十歲、短白髮、深藍布衫', continuityLocks: ['short white hair'] },
  });
  expect(response.status()).toBe(201);
  const { character } = characterResponseSchema.parse(await response.json());
  expect(character.isSeries).toBe(true);
});

const invalidCharacters: Record<string, { seriesId?: string; data: Record<string, unknown> }> = {
  角色名稱是空白: { data: { name: '', description: '短髮' } },
  外觀描述是空白: { data: { name: uniqueName('角色'), description: '' } },
  已經有同名系列角色: { data: { name: '阿嬤', description: '短髮' } },
  系列不存在: { seriesId: 'no-such-series', data: { name: '阿公', description: '短髮' } },
};

When(/^我透過 API 在這個系列的角色庫新增角色，但(.+)$/, async ({ request, state }, situation: string) => {
  const found = invalidCharacters[situation];
  if (!found) throw new Error(`沒有定義這種情況：${situation}`);
  const seriesId = found.seriesId ?? requireSeriesId(state);
  state.lastResponse = await request.post(`/api/series/${seriesId}/characters`, { data: found.data });
});

Then(/^角色庫有角色「(.+)」，標示「(.+)」與「(.+)」$/, async ({ page }, name: string, first: string, second: string) => {
  const card = libraryCharacter(page, name);
  await expect(card.getByText(first, { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(card.getByText(second, { exact: true })).toBeVisible();
});

Then(/^角色庫的角色「(.+)」標示「(.+)」$/, async ({ page }, name: string, tag: string) => {
  await expect(libraryCharacter(page, name).getByText(tag, { exact: true })).toBeVisible({ timeout: 20_000 });
});

Then(/^角色庫的角色「(.+)」有「三視圖」與「定裝圖」$/, async ({ page }, name: string) => {
  const card = libraryCharacter(page, name);
  await expect(card.getByRole('img', { name: `${name}三視圖`, exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(card.getByRole('img', { name: `${name}定裝圖`, exact: true })).toBeVisible();
});

// 同意門檻是全域設定，其他情境會並行修改：需要同意時才會跳出費用確認
When(/^我按下「(.+)」，需要時在費用確認對話框同意$/, async ({ page }, name: string) => {
  await page.getByRole('button', { name, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '費用確認' });
  const started = library(page).getByText(/^(生成中|待確認)$/);
  await expect(dialog.or(started).first()).toBeVisible({ timeout: 20_000 });
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: '同意並產生', exact: true }).click();
});

Then(/^這支影片能用的角色有「(.+)」，是系列角色$/, async ({ request, state }, name: string) => {
  const videoId = state.videoIds?.at(-1);
  if (!videoId) throw new Error('這個場景還沒有建立影片');
  const response = await request.get(`/api/videos/${videoId}/characters`);
  expect(response.status()).toBe(200);
  const found = characterListResponseSchema.parse(await response.json()).characters.find((c) => c.name === name);
  expect(found?.isSeries).toBe(true);
  expect(found?.seriesId).toBe(requireSeriesId(state));
  expect(found?.videoId).toBeNull();
});

// ── 無障礙 ──

Then('系列設定頁沒有 WCAG 2 AA 的無障礙問題', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1, name: '系列設定' })).toBeVisible();
  await expect(library(page)).toBeVisible();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(result.violations.map((v) => `${v.id}：${v.help}`)).toEqual([]);
});
