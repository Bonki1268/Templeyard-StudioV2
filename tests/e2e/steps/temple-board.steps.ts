import { expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';
import { STANDARD_VIEWS, type TempleBoard } from '@templeyard/shared';
import { Given, Then, When } from './fixtures';
import {
  consentViaApi,
  createSeriesViaApi,
  createVideoViaApi,
  fetchBoard,
  fetchVideoDetail,
  generateBoardViaApi,
  templeIdByName,
  uploadPhotoViaApi,
  videoIdFrom,
} from './support/api';

// 第 5 階段：寺廟定裝版

type State = {
  seriesId?: string;
  seriesName?: string;
  videoIds?: string[];
  lastResponse?: APIResponse;
  boardAssets?: Record<string, string | null>;
};

function requireSeriesId(state: State): string {
  if (!state.seriesId) throw new Error('這個場景還沒有建立系列');
  return state.seriesId;
}

function requireVideoId(state: State): string {
  const id = state.videoIds?.at(-1);
  if (!id) throw new Error('這個場景還沒有建立影片');
  return id;
}

function viewKeyOf(name: string): string {
  const view = STANDARD_VIEWS.find((v) => v.name === name);
  if (!view) throw new Error(`標準視角沒有：${name}`);
  return view.key;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function viewCard(page: Page, name: string) {
  return page.getByRole('article', { name: `視角圖：${name}` });
}

function consentDialog(page: Page) {
  return page.getByRole('dialog', { name: '費用確認' });
}

function rememberAssets(state: State, board: TempleBoard) {
  state.boardAssets = Object.fromEntries(board.views.map((v) => [v.viewName, v.assetId]));
}

/** 新的系列（或沿用這個場景的系列）裡建立一支影片，產生定裝版 */
async function videoWithBoard(request: APIRequestContext, state: State, temple: string, inferred: string[] = [], newSeries = true) {
  if (newSeries || !state.seriesId) {
    const series = await createSeriesViaApi(request);
    state.seriesId = series.id;
    state.seriesName = series.name;
  }
  const { response } = await createVideoViaApi(request, requireSeriesId(state), temple);
  expect(response.status()).toBe(201);
  const videoId = await videoIdFrom(response);
  state.videoIds = [...(state.videoIds ?? []), videoId];
  const board = await generateBoardViaApi(request, videoId, { inferredViewKeys: inferred.map(viewKeyOf) });
  rememberAssets(state, board);
  return videoId;
}

// ── 準備 ──

Given(/^我已經透過 API 為一支「(.+)」的影片產生寺廟定裝版$/, async ({ request, state }, temple: string) => {
  await videoWithBoard(request, state, temple);
});

Given(
  /^我已經為一支「(.+)」的影片產生寺廟定裝版，視角是「廟前全景」(?:，另外讓 AI 推測「(.+)」)?$/,
  async ({ request, state }, temple: string, inferred: string | undefined) => {
    await videoWithBoard(request, state, temple, inferred ? [inferred] : []);
  },
);

Given(/^這個系列的「(.+)」已有確認過的寺廟定裝版$/, async ({ request, state }, temple: string) => {
  const videoId = await videoWithBoard(request, state, temple);
  const response = await request.post(`/api/videos/${videoId}/temple-board/confirm`);
  expect(response.status()).toBe(200);
});

Given(/^我透過 API 為同一個系列再建立一支「(.+)」的影片並沿用定裝版$/, async ({ request, state }, temple: string) => {
  const { response } = await createVideoViaApi(request, requireSeriesId(state), temple);
  expect(response.status()).toBe(201);
  const videoId = await videoIdFrom(response);
  state.videoIds = [...(state.videoIds ?? []), videoId];
  const reused = await request.post(`/api/videos/${videoId}/temple-board/reuse`);
  expect(reused.status()).toBe(200);
});

Given('我透過 API 為這支影片另存新版本', async ({ request, state }) => {
  const response = await request.post(`/api/videos/${requireVideoId(state)}/temple-board/versions`);
  expect(response.status()).toBe(201);
});

// ── 頁面 ──

When('我打開這支影片的建立影片頁', async ({ page, request, state }) => {
  const detail = await fetchVideoDetail(request, requireVideoId(state));
  await page.goto(`/series/${detail.video.seriesId}/videos/new?video=${detail.video.id}`);
});

When('我打開這支影片的定裝版頁', async ({ page, state }) => {
  await page.goto(`/videos/${requireVideoId(state)}/temple-board`);
});

When('我打開這支影片的創作工作區', async ({ page, state }) => {
  await page.goto(`/videos/${requireVideoId(state)}/studio`);
});

Then(/^網址是這支影片的「(.+)」$/, async ({ page, state }, pattern: string) => {
  const expected = pattern.replace(':vid', requireVideoId(state));
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(expected)}$`));
});

Then(/^「([^」]+)」按鈕可以按$/, async ({ page }, name: string) => {
  await expect(page.getByRole('button', { name, exact: true })).toBeEnabled();
});

Then(/^「(.+)」的選項可以選$/, async ({ page }, group: string) => {
  const options = page.getByRole('group', { name: group }).getByRole('button');
  await expect(options.first()).toBeVisible();
  for (const option of await options.all()) await expect(option).toBeEnabled();
});

Then(/^「(.+)」的選項都不能選$/, async ({ page }, group: string) => {
  const options = page.getByRole('group', { name: group }).getByRole('button');
  await expect(options.first()).toBeVisible();
  for (const option of await options.all()) await expect(option).toBeDisabled();
});

// ── 費用確認對話框 ──

Then(/^費用確認對話框說明「(.+)」$/, async ({ page }, text: string) => {
  await expect(consentDialog(page)).toBeVisible();
  await expect(consentDialog(page).getByText(text, { exact: true })).toBeVisible();
});

When(/^我在費用確認對話框按下「(.+)」$/, async ({ page }, name: string) => {
  await consentDialog(page).getByRole('button', { name, exact: true }).click();
});

Then('費用確認對話框已關閉', async ({ page }) => {
  await expect(consentDialog(page)).toHaveCount(0);
});

// ── 視角圖卡 ──

Then(/^視角圖「(.+)」標示「(.+)」$/, async ({ page }, view: string, tag: string) => {
  await expect(viewCard(page, view).getByText(tag, { exact: true })).toBeVisible({ timeout: 15_000 });
});

Then(/^視角圖「(.+)」顯示「(.+)」$/, async ({ page }, view: string, text: string) => {
  await expect(viewCard(page, view).getByText(text, { exact: true })).toBeVisible({ timeout: 15_000 });
});

Then(/^視角圖「(.+)」換成新的圖$/, async ({ page, state }, view: string) => {
  const before = state.boardAssets?.[view];
  if (!before) throw new Error(`沒有記下「${view}」原本的視角圖`);
  const image = viewCard(page, view).getByRole('img', { name: `${view}視角圖` });
  await expect(image).toBeVisible();
  await expect(image).not.toHaveAttribute('src', new RegExp(escapeRegExp(before)));
});

Then(/^「(.+)」最近一次生成的修改指令是「(.+)」$/, async ({ request, state }, view: string, instruction: string) => {
  await expect
    .poll(async () => (await fetchBoard(request, requireVideoId(state))).views.find((v) => v.viewName === view)?.lastInstruction)
    .toBe(instruction);
});

// ── API ──

Then('這支影片的模型還沒有鎖定', async ({ request, state }) => {
  const detail = await fetchVideoDetail(request, requireVideoId(state));
  expect(detail.video.modelsLockedAt).toBeNull();
});

Then('這支影片的模型已經鎖定', async ({ request, state }) => {
  const detail = await fetchVideoDetail(request, requireVideoId(state));
  expect(detail.video.modelsLockedAt).not.toBeNull();
});

When(/^我透過 API 把這支影片的「(.+)」改成「(.+)」$/, async ({ request, state }, field: string, value: string) => {
  const videoId = requireVideoId(state);
  const data: Record<string, unknown> = {};
  switch (field) {
    case '影片模型':
      data.videoModel = value;
      break;
    case '圖片模型':
      data.imageModel = value;
      break;
    case '寺廟':
      data.templeId = await templeIdByName(request, value);
      break;
    case '寺廟歷史與簡介':
      data.userTempleNotes = value;
      break;
    default:
      throw new Error(`沒有這個欄位：${field}`);
  }
  state.lastResponse = await request.patch(`/api/videos/${videoId}`, { data });
});

When(/^我透過 API 產生寺廟定裝版，但(.+)$/, async ({ request, state }, situation: string) => {
  const videoId = requireVideoId(state);
  const url = `/api/videos/${videoId}/temple-board/generate`;
  switch (situation) {
    case '還沒有照片':
      state.lastResponse = await request.post(url, { data: { inferredViewKeys: [], consentToken: await consentViaApi(request, videoId, 1) } });
      return;
    case '照片沒有指定視角': {
      expect((await uploadPhotoViaApi(request, videoId)).status()).toBe(201);
      state.lastResponse = await request.post(url, { data: { inferredViewKeys: [], consentToken: await consentViaApi(request, videoId, 1) } });
      return;
    }
    case '沒有同意憑證': {
      expect((await uploadPhotoViaApi(request, videoId, { viewKey: 'front_overview' })).status()).toBe(201);
      state.lastResponse = await request.post(url, { data: { inferredViewKeys: [] } });
      return;
    }
    case 'AI 推測的視角不在標準清單':
      state.lastResponse = await request.post(url, { data: { inferredViewKeys: ['custom_gate'] } });
      return;
    default:
      throw new Error(`沒有這個情況：${situation}`);
  }
});

When('我透過 API 再產生一次寺廟定裝版', async ({ request, state }) => {
  const videoId = requireVideoId(state);
  state.lastResponse = await request.post(`/api/videos/${videoId}/temple-board/generate`, {
    data: { inferredViewKeys: [], consentToken: await consentViaApi(request, videoId, 1) },
  });
});

When('我透過 API 確認這支影片的寺廟定裝版', async ({ request, state }) => {
  state.lastResponse = await request.post(`/api/videos/${requireVideoId(state)}/temple-board/confirm`);
});

Then('第一支影片仍使用第 1 版定裝版', async ({ request, state }) => {
  const first = state.videoIds?.[0];
  if (!first) throw new Error('這個場景沒有第一支影片');
  const board = await fetchBoard(request, first);
  expect(board.version.version).toBe(1);
  expect(board.version.confirmedAt).not.toBeNull();
});
