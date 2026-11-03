import { expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';
import { characterListResponseSchema, templeBoardResponseSchema, type Character } from '@templeyard/shared';
import { Given, Then, When } from './fixtures';
import { chatViaApi, confirmBoardViaApi, consentViaApi, createVideoViaApi, videoIdFrom } from './support/api';

// 第 8 階段：角色定裝版、補充視角

type State = { seriesId?: string; seriesName?: string; videoIds?: string[]; lastResponse?: APIResponse };

function requireVideoId(state: State): string {
  const id = state.videoIds?.at(-1);
  if (!id) throw new Error('這個場景還沒有建立影片');
  return id;
}

function characterCard(page: Page, name: string) {
  return page.getByRole('region', { name: '角色', exact: true }).getByRole('article', { name: `角色：${name}`, exact: true });
}

async function fetchCharacter(request: APIRequestContext, videoId: string, name: string): Promise<Character> {
  const response = await request.get(`/api/videos/${videoId}/characters`);
  expect(response.status()).toBe(200);
  const found = characterListResponseSchema.parse(await response.json()).characters.find((c) => c.name === name);
  if (!found) throw new Error(`這支影片沒有角色：${name}`);
  return found;
}

async function generateCharacter(request: APIRequestContext, videoId: string, name: string) {
  const character = await fetchCharacter(request, videoId, name);
  const consentToken = await consentViaApi(request, videoId, 2);
  const response = await request.post(`/api/characters/${character.id}/generate`, { data: { videoId, consentToken } });
  expect(response.status()).toBe(202);
  await expect.poll(async () => (await fetchCharacter(request, videoId, name)).state, { timeout: 15_000 }).toBe('pending_confirm');
  return character.id;
}

async function fetchBoardViews(request: APIRequestContext, videoId: string) {
  const response = await request.get(`/api/videos/${videoId}/temple-board`);
  expect(response.status()).toBe(200);
  return templeBoardResponseSchema.parse(await response.json()).board.views;
}

// ── 準備 ──

Given(/^我已經透過 API 產生「(.+)」的定裝圖$/, async ({ request, state }, name: string) => {
  await generateCharacter(request, requireVideoId(state), name);
});

Given(/^我已經透過 API 產生並確認「(.+)」的定裝圖$/, async ({ request, state }, name: string) => {
  const id = await generateCharacter(request, requireVideoId(state), name);
  expect((await request.post(`/api/characters/${id}/confirm`)).status()).toBe(200);
});

When(/^我為同一個系列的另一支「(.+)」影片建立分鏡方案$/, async ({ request, state }, temple: string) => {
  if (!state.seriesId) throw new Error('這個場景還沒有建立系列');
  const { response } = await createVideoViaApi(request, state.seriesId, temple);
  expect(response.status()).toBe(201);
  const videoId = await videoIdFrom(response);
  state.videoIds = [...(state.videoIds ?? []), videoId];
  await confirmBoardViaApi(request, videoId);
  expect((await chatViaApi(request, videoId, '講媽祖顯靈救漁民的故事')).at(-1)?.type).toBe('done');
  const submitted = await request.put(`/api/videos/${videoId}/questionnaire`, { data: { answers: [{ questionId: 'story', custom: '講媽祖顯靈救漁民的故事' }] } });
  expect(submitted.status()).toBe(200);
  expect((await request.post(`/api/videos/${videoId}/plan/generate`)).status()).toBe(201);
});

When(/^我已經透過 API 補充並確認視角「(.+)」$/, async ({ request, state }, name: string) => {
  const videoId = requireVideoId(state);
  const consentToken = await consentViaApi(request, videoId, 1);
  const added = await request.post(`/api/videos/${videoId}/temple-board/supplemental-views`, { data: { viewName: name, consentToken } });
  expect(added.status()).toBe(202);
  await expect.poll(async () => (await fetchBoardViews(request, videoId)).find((v) => v.viewName === name)?.state, { timeout: 15_000 }).toBe('ready');
  const confirmed = await request.post(`/api/videos/${videoId}/temple-board/supplemental-views/${encodeURIComponent(`custom:${name}`)}/confirm`);
  expect(confirmed.status()).toBe(200);
});

// ── 角色卡 ──

Then(/^角色「(.+)」標示「(.+)」$/, async ({ page }, name: string, tag: string) => {
  await expect(characterCard(page, name).getByText(tag, { exact: true })).toBeVisible({ timeout: 15_000 });
});

Then(/^角色「(.+)」有「三視圖」與「定裝圖」$/, async ({ page }, name: string) => {
  await expect(characterCard(page, name).getByRole('img', { name: `${name}三視圖`, exact: true })).toBeVisible();
  await expect(characterCard(page, name).getByRole('img', { name: `${name}定裝圖`, exact: true })).toBeVisible();
});

Then(/^還不能生成的原因不包含「(.+)」$/, async ({ page }, reason: string) => {
  const items = page.getByRole('list', { name: '還不能生成的原因' }).getByRole('listitem');
  await expect(items.first()).toBeVisible();
  await expect(items.filter({ hasText: reason })).toHaveCount(0);
});

When(/^我透過 API 操作角色「(.+)」，但(.+)$/, async ({ request, state }, name: string, situation: string) => {
  const videoId = requireVideoId(state);
  const character = await fetchCharacter(request, videoId, name);
  switch (situation) {
    case '產生定裝圖沒有同意憑證':
      state.lastResponse = await request.post(`/api/characters/${character.id}/generate`, { data: { videoId } });
      return;
    case '定裝圖還沒產生就確認':
      state.lastResponse = await request.post(`/api/characters/${character.id}/confirm`);
      return;
    case '外觀描述是空白':
      state.lastResponse = await request.patch(`/api/characters/${character.id}`, { data: { description: '  ', continuityLocks: [] } });
      return;
    case '角色不存在':
      state.lastResponse = await request.post('/api/characters/no-such-character/confirm');
      return;
    default:
      throw new Error(`沒有這個情況：${situation}`);
  }
});

// ── 補充視角 ──

Then(/^場景卡的「(.+)」標示「(.+)」$/, async ({ page }, view: string, tag: string) => {
  const item = page.getByRole('region', { name: '場景', exact: true }).getByRole('listitem').filter({ hasText: view });
  await expect(item.getByText(tag, { exact: true })).toBeVisible({ timeout: 15_000 });
});

Then(/^第 (\d+) 格沒有標示「(.+)」$/, async ({ page }, seq: string, text: string) => {
  const card = page.getByRole('list', { name: '分鏡卡片' }).getByRole('article', { name: `第 ${seq} 格`, exact: true });
  await expect(card).toBeVisible();
  await expect(card.getByText(text, { exact: true })).toHaveCount(0);
});

Then(/^這支影片的寺廟定裝版有視角「(.+)」，來源是 AI 推測、已確認$/, async ({ request, state }, name: string) => {
  const view = (await fetchBoardViews(request, requireVideoId(state))).find((v) => v.viewName === name);
  expect(view).toMatchObject({ source: 'ai_inferred', confirmed: true, createdFromVideoId: requireVideoId(state) });
});

When(/^我透過 API 補充視角，但(.+)$/, async ({ request, state }, situation: string) => {
  const videoId = requireVideoId(state);
  const url = `/api/videos/${videoId}/temple-board/supplemental-views`;
  switch (situation) {
    case '沒有同意憑證':
      state.lastResponse = await request.post(url, { data: { viewName: '後殿' } });
      return;
    case '視角名稱是空白':
      state.lastResponse = await request.post(url, { data: { viewName: '  ', consentToken: await consentViaApi(request, videoId, 1) } });
      return;
    case '定裝版已經有這個視角':
      state.lastResponse = await request.post(url, { data: { viewName: '廟前全景', consentToken: await consentViaApi(request, videoId, 1) } });
      return;
    case '還沒產生就確認':
      state.lastResponse = await request.post(`${url}/${encodeURIComponent('custom:後殿')}/confirm`);
      return;
    default:
      throw new Error(`沒有這個情況：${situation}`);
  }
});

// ── 第 7 階段稽核：卡片真的標紅 ──

Then(/^第 (\d+) 格以紅色外框標示$/, async ({ page }, seq: string) => {
  const card = page.getByRole('list', { name: '分鏡卡片' }).getByRole('article', { name: `第 ${seq} 格`, exact: true });
  const colors = await card.evaluate((el) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--color-error)';
    document.body.appendChild(probe);
    const error = getComputedStyle(probe).color;
    probe.remove();
    return { border: getComputedStyle(el).borderTopColor, error, text: getComputedStyle(document.body).color };
  });
  // token 沒定義時探針會拿到繼承的文字顏色；先確認 --color-error 真的和文字顏色不同
  expect(colors.error).not.toBe(colors.text);
  expect(colors.border).toBe(colors.error);
});
