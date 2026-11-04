import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { apiErrorSchema, seriesResponseSchema, type CreateSeriesInput } from '@templeyard/shared';
import { Given, Then, When } from './fixtures';

// 每個場景用不同的名稱，平行執行時不會互相影響
function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function seriesList(page: Page) {
  return page.getByRole('region', { name: '你的系列' });
}

function seriesCard(page: Page, name: string) {
  return seriesList(page)
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name, exact: true }) });
}

function requireName(state: { seriesName?: string }): string {
  if (!state.seriesName) throw new Error('這個場景還沒有建立系列');
  return state.seriesName;
}

const validInput: CreateSeriesInput = {
  name: '',
  visualStyle: '寫實電影感、清晨暖光、淺景深',
  direction: '歷史故事',
  defaultImageModel: 'nano-banana-pro',
  defaultVideoModel: 'gemini-omni-1.1-flash',
};

// ── 首頁表單 ──

When('我填寫系列名稱為新的名稱', async ({ page, state }) => {
  state.seriesName = uniqueName('測試系列');
  await page.getByLabel('系列名稱').fill(state.seriesName);
});

When(/^我在「([^」]+)」填入「([^」]+)」$/, async ({ page }, label: string, value: string) => {
  await page.getByLabel(label, { exact: true }).fill(value);
});

When(/^我在「([^」]+)」選擇「([^」]+)」$/, async ({ page }, group: string, option: string) => {
  await page.getByRole('group', { name: group }).getByRole('button', { name: option, exact: true }).click();
});

When(/^我在「([^」]+)」的「或自己寫」填入「([^」]+)」$/, async ({ page }, group: string, value: string) => {
  await page.getByRole('group', { name: group }).getByLabel('或自己寫').fill(value);
});

When(/^我按下「([^」]+)」$/, async ({ page }, name: string) => {
  await page.getByRole('button', { name, exact: true }).click();
});

Given('我已經在首頁建立一個系列', async ({ page, state }) => {
  await page.goto('/');
  state.seriesName = uniqueName('測試系列');
  await page.getByLabel('系列名稱').fill(state.seriesName);
  await page.getByLabel('整體視覺風格', { exact: true }).fill('紅磚老街、懷舊');
  await page.getByRole('group', { name: '影片方向' }).getByRole('button', { name: '歷史故事' }).click();
  await page.getByRole('button', { name: '建立系列', exact: true }).click();
  await expect(seriesCard(page, state.seriesName)).toBeVisible();
});

When('我重新整理頁面', async ({ page }) => {
  await page.reload();
});

Then('系列列表出現這個系列', async ({ page, state }) => {
  await expect(seriesCard(page, requireName(state))).toBeVisible();
});

Then(/^這個系列的卡片顯示「(.+)」$/, async ({ page, state }, text: string) => {
  await expect(seriesCard(page, requireName(state)).getByText(text, { exact: true })).toBeVisible();
});

Then(/^這個系列的卡片有「(.+)」連結$/, async ({ page, state }, name: string) => {
  await expect(seriesCard(page, requireName(state)).getByRole('link', { name })).toBeVisible();
});

Then(/^「([^」]+)」按鈕不能按$/, async ({ page }, name: string) => {
  await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
});

Then(/^我看到「(.+)」$/, async ({ page }, text: string) => {
  await expect(page.getByText(text, { exact: true })).toBeVisible();
});

Then(/^「([^」]+)」的「([^」]+)」已被選取$/, async ({ page }, group: string, option: string) => {
  const button = page.getByRole('group', { name: group }).getByRole('button', { name: option, exact: true });
  await expect(button).toHaveAttribute('aria-pressed', 'true');
});

Then(/^「([^」]+)」的「([^」]+)」沒有被選取$/, async ({ page }, group: string, option: string) => {
  const button = page.getByRole('group', { name: group }).getByRole('button', { name: option, exact: true });
  await expect(button).toHaveAttribute('aria-pressed', 'false');
});

// ── API ──

Given('我已經透過 API 建立一個系列', async ({ request, state }) => {
  const response = await request.post('/api/series', { data: { ...validInput, name: uniqueName('API系列') } });
  expect(response.status()).toBe(201);
  const { series } = seriesResponseSchema.parse(await response.json());
  state.seriesId = series.id;
  state.seriesName = series.name;
});

When('我透過 API 把這個系列的名稱改成新的名稱', async ({ request, state }) => {
  if (!state.seriesId) throw new Error('這個場景還沒有建立系列');
  state.seriesName = uniqueName('改名系列');
  const response = await request.patch(`/api/series/${state.seriesId}`, { data: { name: state.seriesName } });
  expect(response.status()).toBe(200);
});

Then('系列列表出現改名後的系列', async ({ page, state }) => {
  await expect(seriesCard(page, requireName(state))).toBeVisible();
});

const invalidCases: Record<string, Partial<Record<keyof CreateSeriesInput, unknown>>> = {
  系列名稱是空白: { name: '' },
  整體視覺風格是空白: { visualStyle: '' },
  影片方向是空白: { direction: '' },
  預設圖片模型不存在: { defaultImageModel: 'not-a-model' },
  預設影片模型不存在: { defaultVideoModel: 'not-a-model' },
};

When(/^我透過 API 建立系列，但(.+)$/, async ({ request, state }, description: string) => {
  const patch = invalidCases[description];
  if (!patch) throw new Error(`沒有定義這種錯誤資料：${description}`);
  state.lastResponse = await request.post('/api/series', {
    data: { ...validInput, name: uniqueName('錯誤系列'), ...patch },
  });
});

When('我透過 API 修改一個不存在的系列', async ({ request, state }) => {
  state.lastResponse = await request.patch('/api/series/no-such-series', { data: { name: '改名' } });
});

Then(/^API 回應 (\d+)，欄位「(.+)」的說明是「(.+)」$/, async ({ state }, status: string, field: string, message: string) => {
  if (!state.lastResponse) throw new Error('還沒有送出請求');
  expect(state.lastResponse.status()).toBe(Number(status));
  const body = apiErrorSchema.parse(await state.lastResponse.json());
  expect(body.fieldErrors?.[field]).toBe(message);
});

Then(/^API 回應 (\d+)，說明是「(.+)」$/, async ({ state }, status: string, message: string) => {
  if (!state.lastResponse) throw new Error('還沒有送出請求');
  expect(state.lastResponse.status()).toBe(Number(status));
  expect(apiErrorSchema.parse(await state.lastResponse.json()).message).toBe(message);
});

// ── 無障礙 ──

Then('頁面沒有 WCAG 2 AA 的無障礙問題', async ({ page }) => {
  // 等表單出現再檢查
  await expect(page.getByLabel('系列名稱')).toBeVisible();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(result.violations.map((v) => `${v.id}：${v.help}`)).toEqual([]);
});

Then('每個輸入框都有標籤', async ({ page }) => {
  const fields = page.locator('input, textarea, select');
  const count = await fields.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    await expect(fields.nth(i)).toHaveAccessibleName(/\S/);
  }
});

When(/^我用 Tab 鍵移到「(.+)」$/, async ({ page }, label: string) => {
  const target = page.getByLabel(label, { exact: true });
  await expect(target).toBeVisible();
  for (let i = 0; i < 40; i += 1) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`按了 40 次 Tab 還是沒有移到「${label}」`);
});

Then(/^「(.+)」顯示 3px 的焦點框$/, async ({ page }, label: string) => {
  const target = page.getByLabel(label, { exact: true });
  await expect(target).toBeFocused();
  const outline = await target.evaluate((el) => {
    const style = getComputedStyle(el);
    return { width: style.outlineWidth, style: style.outlineStyle };
  });
  expect(outline).toEqual({ width: '3px', style: 'solid' });
});
