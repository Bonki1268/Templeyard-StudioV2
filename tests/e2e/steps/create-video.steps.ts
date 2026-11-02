import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { seriesListResponseSchema, videoDetailResponseSchema } from '@templeyard/shared';
import { Given, Then, When } from './fixtures';
import {
  createSeriesViaApi,
  createVideoViaApi,
  fetchVideoDetail,
  templeIdByName,
  videoIdFrom,
  videoModelKey,
} from './support/api';

type State = { seriesId?: string; seriesName?: string; videoIds?: string[] };

function requireSeriesId(state: State): string {
  if (!state.seriesId) throw new Error('這個場景還沒有建立系列');
  return state.seriesId;
}

function requireVideoId(state: State): string {
  const id = state.videoIds?.at(-1);
  if (!id) throw new Error('這個場景還沒有建立影片');
  return id;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stepList(page: Page) {
  return page.getByRole('list', { name: '建立影片的步驟' });
}

function templeCard(page: Page) {
  return page.getByRole('region', { name: '寺廟資料卡' });
}

function modelOption(page: Page, group: string, model: string) {
  return page.getByRole('group', { name: group }).getByRole('button', { name: model, exact: true });
}

// ── 準備資料 ──

Given(/^我已經透過 API 建立一個預設影片模型為「(.+)」的系列$/, async ({ request, state }, label: string) => {
  const series = await createSeriesViaApi(request, { defaultVideoModel: videoModelKey(label) });
  state.seriesId = series.id;
  state.seriesName = series.name;
});

Given(/^我已經為(一個|這個)系列選好寺廟「(.+)」$/, async ({ page, request, state }, which: string, temple: string) => {
  if (which === '一個') {
    const series = await createSeriesViaApi(request);
    state.seriesId = series.id;
    state.seriesName = series.name;
  }
  const seriesId = requireSeriesId(state);
  const { response } = await createVideoViaApi(request, seriesId, temple);
  expect(response.status()).toBe(201);
  const videoId = await videoIdFrom(response);
  state.videoIds = [...(state.videoIds ?? []), videoId];
  await page.goto(`/series/${seriesId}/videos/new?video=${videoId}`);
  await expect(templeCard(page).getByRole('heading', { name: temple })).toBeVisible();
});

// ── 建立影片頁 ──

When('我打開這個系列的建立影片頁', async ({ page, state }) => {
  await page.goto(`/series/${requireSeriesId(state)}/videos/new`);
});

Then(/^步驟列依序是「(.+)」$/, async ({ page }, steps: string) => {
  const names = steps.split('、');
  await expect(stepList(page).getByRole('listitem')).toHaveText(names.map((name) => new RegExp(escapeRegExp(name))));
});

Then(/^目前步驟是「(.+)」$/, async ({ page }, step: string) => {
  const current = stepList(page).locator('[aria-current="step"]');
  await expect(current).toHaveCount(1);
  await expect(current).toContainText(step);
});

When(/^我在搜尋結果選擇「(.+)」$/, async ({ page }, temple: string) => {
  await page.getByRole('list', { name: '搜尋結果' }).getByRole('button', { name: temple, exact: true }).click();
});

Then(/^寺廟資料卡的「(.+)」是「(.+)」$/, async ({ page }, label: string, value: string) => {
  // Playwright 依 ARIA 規則不讓 definition（dd）有名稱，所以先找 dt，再取緊接在後面的 dd
  const term = templeCard(page).getByRole('term').filter({ has: page.getByText(label, { exact: true }) });
  await expect(term).toHaveCount(1);
  await expect(term.locator('xpath=following-sibling::dd[1]')).toHaveText(value);
});

Then('網址帶有這支影片的編號', async ({ page }) => {
  await expect(page).toHaveURL(/\/series\/[^/]+\/videos\/new\?video=[^&]+$/);
});

When('我離開這個欄位', async ({ page }) => {
  await page.keyboard.press('Tab');
  // 離開欄位時自動儲存，等儲存完成
  await expect(page.getByRole('status').filter({ hasText: '已儲存寺廟歷史與簡介' })).toBeVisible();
});

Then(/^「([^」]+)」的內容是「(.+)」$/, async ({ page }, label: string, value: string) => {
  await expect(page.getByLabel(label, { exact: true })).toHaveValue(value);
});

Then(/^「([^」]+)」的「([^」]+)」標示「(.+)」$/, async ({ page }, group: string, model: string, tag: string) => {
  const option = page
    .getByRole('group', { name: group })
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: model, exact: true }) });
  await expect(option.getByText(tag, { exact: true })).toBeVisible();
});

Then(/^「([^」]+)」的「([^」]+)」說明包含「(.+)」$/, async ({ page }, group: string, model: string, text: string) => {
  await expect(modelOption(page, group, model)).toHaveAccessibleDescription(new RegExp(escapeRegExp(text)));
});

Then('這一頁沒有 WCAG 2 AA 的無障礙問題', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(result.violations.map((v) => `${v.id}：${v.help}`)).toEqual([]);
});

// ── 影片 API ──

When(/^我透過 API 為這個系列建立一支「(.+)」的影片$/, async ({ request, state }, temple: string) => {
  const { response } = await createVideoViaApi(request, requireSeriesId(state), temple);
  state.lastResponse = response;
  if (response.status() === 201) state.videoIds = [...(state.videoIds ?? []), await videoIdFrom(response)];
});

Then(/^API 回應 (\d+)$/, async ({ state }, status: string) => {
  if (!state.lastResponse) throw new Error('還沒有送出請求');
  expect(state.lastResponse.status()).toBe(Number(status));
});

Then(/^這支影片的影片模型是「(.+)」、圖片模型是「(.+)」$/, async ({ request, state }, videoModel: string, imageModel: string) => {
  const { video } = await fetchVideoDetail(request, requireVideoId(state));
  expect({ videoModel: video.videoModel, imageModel: video.imageModel }).toEqual({ videoModel, imageModel });
});

Then(/^這支影片的階段是「(.+)」，模型還沒有鎖定$/, async ({ request, state }, stage: string) => {
  const { video } = await fetchVideoDetail(request, requireVideoId(state));
  expect(video.stage).toBe(stage);
  expect(video.modelsLockedAt).toBeNull();
});

When(/^我透過 API 建立影片，但(系列不存在|寺廟不存在)$/, async ({ request, state }, situation: string) => {
  const templeId = await templeIdByName(request, '板橋慈惠宮');
  const data =
    situation === '系列不存在'
      ? { seriesId: 'no-such-series', templeId }
      : { seriesId: requireSeriesId(state), templeId: 'no-such-temple' };
  state.lastResponse = await request.post('/api/videos', { data });
});

const invalidVideoPatches: Record<string, Record<string, unknown>> = {
  圖片模型不在清單裡: { imageModel: 'not-a-model' },
  影片模型不在清單裡: { videoModel: 'not-a-model' },
  '寺廟歷史與簡介超過 5000 字': { userTempleNotes: '廟'.repeat(5001) },
};

When(/^我透過 API 修改這支影片，但(.+)$/, async ({ request, state }, situation: string) => {
  const patch = invalidVideoPatches[situation];
  if (!patch) throw new Error(`沒有定義這種錯誤資料：${situation}`);
  state.lastResponse = await request.patch(`/api/videos/${requireVideoId(state)}`, { data: patch });
});

// ── 系列的補充情境（F1） ──

When(/^我透過 API 把這個系列的預設影片模型改成「(.+)」$/, async ({ request, state }, model: string) => {
  const response = await request.patch(`/api/series/${requireSeriesId(state)}`, { data: { defaultVideoModel: model } });
  expect(response.status()).toBe(200);
});

Then(/^先前建立的影片，影片模型仍是「(.+)」$/, async ({ request, state }, model: string) => {
  const first = state.videoIds?.[0];
  if (!first) throw new Error('這個場景還沒有建立影片');
  const response = await request.get(`/api/videos/${first}`);
  expect(videoDetailResponseSchema.parse(await response.json()).video.videoModel).toBe(model);
});

When(/^我按下這個系列卡片上的「(.+)」$/, async ({ page, state }, name: string) => {
  if (!state.seriesName) throw new Error('這個場景還沒有建立系列');
  const card = page
    .getByRole('region', { name: '你的系列' })
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: state.seriesName, exact: true }) });
  await card.getByRole('link', { name }).click();
});

Then(/^網址是這個系列的「(.+)」$/, async ({ page, request, state }, pattern: string) => {
  const response = await request.get('/api/series');
  const series = seriesListResponseSchema.parse(await response.json()).series.find((s) => s.name === state.seriesName);
  if (!series) throw new Error('找不到這個系列');
  const expected = pattern.replace(':sid', series.id);
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(expected)}$`));
});

