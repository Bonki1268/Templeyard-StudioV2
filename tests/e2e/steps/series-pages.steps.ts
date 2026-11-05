import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext, type APIResponse, type Locator, type Page } from '@playwright/test';
import { QUESTIONNAIRE_QUESTIONS, VIDEO_MODELS, characterListResponseSchema } from '@templeyard/shared';
import { Given, Then, When } from './fixtures';
import { createSeriesViaApi, createVideoViaApi, fetchVideoDetail, videoIdFrom } from './support/api';

// 系列頁（第 14 階段，docs/design/series/）：分頁、系列設定、問卷預設值、角色庫、角色詳情、過去的影片

type State = {
  seriesId?: string;
  seriesName?: string;
  videoIds?: string[];
  characterId?: string;
  otherCharacterId?: string;
  characterAssets?: { sheet: string | null; look: string | null };
  lastResponse?: APIResponse;
  downloaded?: { filename: string; bytes: Buffer };
};

type ApiVersion = {
  id: string;
  version: number;
  description: string;
  identityAnchors: string | null;
  look: string | null;
  changeNote: string | null;
  continuityLocks: string[];
  sheetAssetId: string | null;
  lookAssetId: string | null;
  confirmedAt: string | null;
};
type ApiCharacter = { id: string; name: string; isSeries: boolean; state: string; version: ApiVersion };

function requireSeriesId(state: State): string {
  if (!state.seriesId) throw new Error('這個場景還沒有建立系列');
  return state.seriesId;
}

function requireCharacterId(state: State): string {
  if (!state.characterId) throw new Error('這個場景還沒有打開角色詳情');
  return state.characterId;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


function seriesNav(page: Page) {
  return page.getByRole('navigation', { name: '系列頁面' });
}

function tabLink(page: Page, name: string) {
  return seriesNav(page).getByRole('link', { name: new RegExp(`^${escapeRegExp(name)}`) });
}

function actionBar(page: Page) {
  return page.getByRole('region', { name: '操作列' });
}

async function listSeriesCharacters(request: APIRequestContext, seriesId: string, query = ''): Promise<ApiCharacter[]> {
  const response = await request.get(`/api/series/${seriesId}/characters${query}`);
  expect(response.status()).toBe(200);
  return characterListResponseSchema.parse(await response.json()).characters as unknown as ApiCharacter[];
}

async function findSeriesCharacter(request: APIRequestContext, seriesId: string, name: string): Promise<ApiCharacter> {
  const found = (await listSeriesCharacters(request, seriesId)).find((c) => c.name === name);
  if (!found) throw new Error(`角色庫沒有「${name}」`);
  return found;
}

async function fetchVersions(request: APIRequestContext, characterId: string): Promise<ApiVersion[]> {
  const response = await request.get(`/api/characters/${characterId}/versions`);
  expect(response.status()).toBe(200);
  return ((await response.json()) as { versions: ApiVersion[] }).versions;
}

async function seriesConsent(request: APIRequestContext, seriesId: string, units: number): Promise<string> {
  const response = await request.post(`/api/series/${seriesId}/consents`, { data: { items: [{ model: 'nano-banana-pro', units }] } });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { consentToken: string }).consentToken;
}

/** 用系列的同意憑證產生角色的三視圖與定裝圖，等到完成 */
async function generateViaApi(request: APIRequestContext, seriesId: string, characterId: string): Promise<void> {
  const consentToken = await seriesConsent(request, seriesId, 2);
  const response = await request.post(`/api/characters/${characterId}/generate`, { data: { consentToken } });
  expect(response.status()).toBe(202);
  await expect
    .poll(async () => (await listSeriesCharacters(request, seriesId)).find((c) => c.id === characterId)?.state, { timeout: 20_000 })
    .toBe('pending_confirm');
}

async function confirmViaApi(request: APIRequestContext, characterId: string): Promise<void> {
  expect((await request.post(`/api/characters/${characterId}/confirm`)).status()).toBe(200);
}

// ── 版面與分頁 ──

When(/^我直接打開這個系列的「(settings|characters|videos)」頁$/, async ({ page, state }, path: string) => {
  await page.goto(`/series/${requireSeriesId(state)}/${path}`);
});

When(/^我打開一個不存在的系列的「(settings|characters|videos)」頁$/, async ({ page }, path: string) => {
  await page.goto(`/series/no-such-series/${path}`);
});

Then('頁面標題是這個系列的名稱', async ({ page, state }) => {
  if (!state.seriesName) throw new Error('這個場景還沒有建立系列');
  await expect(page.getByRole('heading', { level: 1, name: state.seriesName, exact: true })).toBeVisible({ timeout: 20_000 });
});

Then(/^頁面標題是「([^」]+)」$/, async ({ page }, title: string) => {
  await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible({ timeout: 20_000 });
});

Then(/^分頁「([^」]+)」是目前所在的頁面$/, async ({ page }, name: string) => {
  await expect(tabLink(page, name)).toHaveAttribute('aria-current', 'page', { timeout: 20_000 });
});

Then('其他兩個分頁不是目前所在的頁面', async ({ page }) => {
  await expect(seriesNav(page).locator('[aria-current="page"]')).toHaveCount(1);
  await expect(seriesNav(page).getByRole('link')).toHaveCount(3);
});

Then(/^頂端顯示「(.+)」開頭的文字$/, async ({ page }, prefix: string) => {
  await expect(page.getByText(new RegExp(`^${escapeRegExp(prefix)}`))).toBeVisible({ timeout: 20_000 });
});

Then(/^分頁「([^」]+)」旁的數量是「(\d+)」$/, async ({ page }, name: string, count: string) => {
  await expect(tabLink(page, name).getByText(count, { exact: true })).toBeVisible({ timeout: 20_000 });
});

When(/^我按下分頁「([^」]+)」$/, async ({ page }, name: string) => {
  await tabLink(page, name).click();
});

Given(/^我已經透過 API 建立另一個系列，並在它的角色庫新增角色「([^」]+)」$/, async ({ request, state }, name: string) => {
  const other = await createSeriesViaApi(request);
  const response = await request.post(`/api/series/${other.id}/characters`, { data: { name, description: '八十歲、白髮' } });
  expect(response.status()).toBe(201);
  state.otherCharacterId = ((await response.json()) as { character: { id: string } }).character.id;
});

When('我用這個系列的網址打開另一個系列的角色詳情', async ({ page, state }) => {
  if (!state.otherCharacterId) throw new Error('這個場景還沒有另一個系列的角色');
  await page.goto(`/series/${requireSeriesId(state)}/characters/${state.otherCharacterId}`);
});

Then('系列頁沒有 WCAG 2 AA 的無障礙問題', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('status').filter({ hasText: /^正在讀取/ })).toHaveCount(0);
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(result.violations.map((v) => `${v.id}：${v.help}`)).toEqual([]);
});

When(/^我用 Tab 鍵移到連結「([^」]+)」$/, async ({ page }, name: string) => {
  const target = tabLink(page, name);
  await expect(target).toBeVisible();
  for (let i = 0; i < 40; i += 1) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`按了 40 次 Tab 還是沒有移到連結「${name}」`);
});

Then(/^連結「([^」]+)」顯示 3px 的焦點框$/, async ({ page }, name: string) => {
  const target = tabLink(page, name);
  await expect(target).toBeFocused();
  const outline = await target.evaluate((el) => ({ width: getComputedStyle(el).outlineWidth, style: getComputedStyle(el).outlineStyle }));
  expect(outline).toEqual({ width: '3px', style: 'solid' });
});

// ── 系列設定分頁 ──

Then(/^底部操作列寫「(.+)」$/, async ({ page }, text: string) => {
  await expect(actionBar(page).getByText(text, { exact: true })).toBeVisible({ timeout: 20_000 });
});

Then('「系列名稱」的內容是這個系列原本的名稱', async ({ page, state }) => {
  await expect(page.getByLabel('系列名稱', { exact: true })).toHaveValue(state.seriesName ?? '');
});

function dialog(page: Page, name: string) {
  return page.getByRole('dialog', { name, exact: true });
}

Then(/^我看到對話框「([^」]+)」$/, async ({ page }, name: string) => {
  await expect(dialog(page, name)).toBeVisible();
});

When(/^我在對話框「([^」]+)」按下「([^」]+)」$/, async ({ page }, name: string, button: string) => {
  await dialog(page, name).getByRole('button', { name: button, exact: true }).click();
});

Then(/^對話框「([^」]+)」已關閉$/, async ({ page }, name: string) => {
  await expect(dialog(page, name)).toHaveCount(0);
});

function questionIdOf(title: string): string {
  const question = QUESTIONNAIRE_QUESTIONS.find((q) => q.title === title);
  if (!question) throw new Error(`題庫沒有這一題：${title}`);
  return question.id;
}

function defaultValue(questionId: string, value: string): { choice?: string; custom?: string } {
  const question = QUESTIONNAIRE_QUESTIONS.find((q) => q.id === questionId);
  return (question?.options as readonly string[] | undefined)?.includes(value) ? { choice: value } : { custom: value };
}

async function setDefault(request: APIRequestContext, seriesId: string, title: string, value: string): Promise<APIResponse> {
  const questionId = questionIdOf(title);
  return request.patch(`/api/series/${seriesId}/questionnaire-defaults`, { data: { defaults: { [questionId]: defaultValue(questionId, value) } } });
}

Given(/^我(?:已經)?透過 API 把這個系列問卷預設值的「([^」]+)」(?:設為|改成)「([^」]+)」$/, async ({ request, state }, title: string, value: string) => {
  const response = await setDefault(request, requireSeriesId(state), title, value);
  expect(response.status()).toBe(200);
});

Then(/^我(沒有)?看到提醒「(.+)」$/, async ({ page }, not: string | undefined, text: string) => {
  const reminder = page.getByRole('status').filter({ hasText: text });
  if (not) await expect(reminder).toHaveCount(0);
  else await expect(reminder).toBeVisible();
});

Then('「單筆同意門檻」顯示目前的全域設定', async ({ page, request }) => {
  const response = await request.get('/api/settings');
  const threshold = ((await response.json()) as { settings: { consentThresholdCredits: number | null } }).settings.consentThresholdCredits;
  // 其他情境可能同時修改門檻：頁面讀到的值要等於讀取當下 API 的值，或至少是整數文字
  const input = page.getByLabel('單筆同意門檻', { exact: true });
  await expect(input).toBeVisible({ timeout: 20_000 });
  if (threshold === null) await expect(input).toHaveValue('');
  else await expect(input).toHaveValue(/^\d+$/);
});

Then(/^這支影片的費用上限是 (\d+) 點$/, async ({ request, state }, limit: string) => {
  const id = state.videoIds?.at(-1);
  if (!id) throw new Error('這個場景還沒有建立影片');
  expect((await fetchVideoDetail(request, id)).video.costLimit).toBe(Number(limit));
});

When('我清除新影片的費用上限', async ({ request }) => {
  const response = await request.patch('/api/settings', { data: { defaultVideoCostLimitCredits: null } });
  expect(response.status()).toBe(200);
});

// ── 問卷預設值 ──

function defaultsRegion(page: Page) {
  return page.getByRole('region', { name: '問卷預設值', exact: true });
}

function defaultsRow(page: Page, title: string): Locator {
  return defaultsRegion(page)
    .getByRole('listitem')
    .filter({ has: page.getByText(title, { exact: true }) });
}

Then(/^問卷預設值的「([^」]+)」是「([^」]+)」，標示「([^」]+)」$/, async ({ page }, title: string, value: string, tag: string) => {
  const row = defaultsRow(page, title);
  await expect(row.getByText(value, { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(row.getByText(tag, { exact: true })).toBeVisible();
});

Then(/^問卷預設值沒有「([^」]+)」$/, async ({ page }, title: string) => {
  await expect(defaultsRegion(page)).toBeVisible({ timeout: 20_000 });
  await expect(defaultsRow(page, title)).toHaveCount(0);
});

Then(/^問卷預設值的說明寫著來自這個系列第一支影片「([^」]+)」的問卷$/, async ({ page }, temple: string) => {
  await expect(defaultsRegion(page).getByText(new RegExp(`來自系列第一支影片〈${escapeRegExp(temple)}[^〉]*〉的問卷`))).toBeVisible({ timeout: 20_000 });
});

When(/^我按下問卷預設值「([^」]+)」的「(修改|清除)」$/, async ({ page }, title: string, action: string) => {
  await defaultsRow(page, title).getByRole('button', { name: `${action}「${title}」`, exact: true }).click();
});

When(/^我在問卷預設值選擇「([^」]+)」$/, async ({ page }, option: string) => {
  await defaultsRegion(page).getByRole('button', { name: option, exact: true }).click();
});

When(/^我透過 API 修改這個系列的問卷預設值，但(.+)$/, async ({ request, state }, situation: string) => {
  const seriesId = situation === '系列不存在' ? 'no-such-series' : requireSeriesId(state);
  const bodies: Record<string, unknown> = {
    題目不在題庫: { defaults: { no_such_question: { choice: '溫暖' } } },
    選項不在這一題: { defaults: { tone: { choice: '搞笑' } } },
    每支影片不同的題目: { defaults: { story: { custom: '一個故事' } } },
    同時選了選項又自己寫: { defaults: { tone: { choice: '溫暖', custom: '更溫暖' } } },
    系列不存在: { defaults: { tone: { choice: '溫暖' } } },
  };
  const data = bodies[situation];
  if (!data) throw new Error(`沒有這個情況：${situation}`);
  state.lastResponse = await request.patch(`/api/series/${seriesId}/questionnaire-defaults`, { data });
});

async function questionnaireAnswer(request: APIRequestContext, videoId: string, title: string) {
  const response = await request.get(`/api/videos/${videoId}/questionnaire`);
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { questionnaire: { answers: { questionId: string; choice?: string; custom?: string; source: string }[] } | null };
  return body.questionnaire?.answers.find((a) => a.questionId === questionIdOf(title));
}

Then(/^這支影片的問卷「([^」]+)」預填「([^」]+)」，來源是系列預設$/, async ({ request, state }, title: string, value: string) => {
  const id = state.videoIds?.at(-1);
  if (!id) throw new Error('這個場景還沒有建立影片');
  const answer = await questionnaireAnswer(request, id, title);
  expect(answer?.choice ?? answer?.custom).toBe(value);
  expect(answer?.source).toBe('series_default');
});

Then(/^第一支影片的問卷「([^」]+)」仍是「([^」]+)」$/, async ({ request, state }, title: string, value: string) => {
  const id = state.videoIds?.[0];
  if (!id) throw new Error('這個場景還沒有建立影片');
  const answer = await questionnaireAnswer(request, id, title);
  expect(answer?.choice ?? answer?.custom).toBe(value);
});

// ── 修改系列、保存的系列設定 ──

When(/^我透過 API 把這個系列的整體視覺風格改成「([^」]+)」$/, async ({ request, state }, style: string) => {
  const response = await request.patch(`/api/series/${requireSeriesId(state)}`, { data: { visualStyle: style } });
  expect(response.status()).toBe(200);
});

type Snapshot = { visualStyle: string; direction: string; defaultImageModel: string; defaultVideoModel: string; questionnaireDefaults: Record<string, { choice?: string; custom?: string }> | null };

async function snapshotOf(request: APIRequestContext, state: State): Promise<Snapshot> {
  const id = state.videoIds?.at(-1);
  if (!id) throw new Error('這個場景還沒有建立影片');
  const { video } = await fetchVideoDetail(request, id);
  const snapshot = (video as unknown as { seriesSnapshot: Snapshot | null }).seriesSnapshot;
  if (!snapshot) throw new Error('這支影片沒有保存系列設定');
  return snapshot;
}

Then(/^這支影片保存的系列設定，整體視覺風格是「([^」]+)」$/, async ({ request, state }, style: string) => {
  expect((await snapshotOf(request, state)).visualStyle).toBe(style);
});

Then(/^這支影片保存的系列設定，預設影片模型是「([^」]+)」$/, async ({ request, state }, label: string) => {
  const key = VIDEO_MODELS.find((m) => m.label === label)?.key;
  expect((await snapshotOf(request, state)).defaultVideoModel).toBe(key);
});

Then(/^這支影片保存的系列設定，問卷預設值的「([^」]+)」是「([^」]+)」$/, async ({ request, state }, title: string, value: string) => {
  const entry = (await snapshotOf(request, state)).questionnaireDefaults?.[questionIdOf(title)];
  expect(entry?.choice ?? entry?.custom).toBe(value);
});

// ── 角色庫分頁 ──

function library(page: Page) {
  return page.getByRole('region', { name: '角色庫', exact: true });
}

function libraryCard(page: Page, name: string) {
  return library(page).getByRole('article', { name: `角色：${name}`, exact: true });
}

Then(/^角色庫的角色「([^」]+)」列出連續性鎖「([^」]+)」$/, async ({ page }, name: string, lock: string) => {
  await expect(libraryCard(page, name).getByText(lock, { exact: true })).toBeVisible({ timeout: 20_000 });
});

Then(/^角色庫的角色「([^」]+)」寫著「([^」]+)」$/, async ({ page }, name: string, text: string) => {
  await expect(libraryCard(page, name).getByText(text, { exact: true })).toBeVisible({ timeout: 20_000 });
});

Given(/^我已經透過 API 在這個系列的角色庫新增角色「([^」]+)」，外觀描述是「([^」]+)」$/, async ({ request, state }, name: string, description: string) => {
  const response = await request.post(`/api/series/${requireSeriesId(state)}/characters`, { data: { name, description } });
  expect(response.status()).toBe(201);
});

Given(
  /^我已經透過 API 在這個系列的角色庫新增角色「([^」]+)」，身份錨點是「([^」]+)」，造型是「([^」]+)」，連續性鎖是「([^」]+)」$/,
  async ({ request, state }, name: string, anchors: string, look: string, lock: string) => {
    const response = await request.post(`/api/series/${requireSeriesId(state)}/characters`, {
      data: { name, identityAnchors: anchors, look, continuityLocks: [lock] },
    });
    expect(response.status()).toBe(201);
  },
);

Then(/^角色庫只列出角色「([^」]+)」(?:，標示「([^」]+)」)?$/, async ({ page }, name: string, tag: string | undefined) => {
  const cards = library(page).getByRole('article');
  await expect(cards).toHaveCount(1, { timeout: 20_000 });
  await expect(libraryCard(page, name)).toBeVisible();
  if (tag) await expect(libraryCard(page, name).getByText(tag, { exact: true })).toBeVisible();
});

Then(/^篩選按鈕「([^」]+)」已被選取$/, async ({ page }, name: string) => {
  await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 });
});

Then(/^角色庫的角色「([^」]+)」沒有「設為系列角色」按鈕$/, async ({ page }, name: string) => {
  await expect(libraryCard(page, name).getByRole('button', { name: /^設為系列角色/ })).toHaveCount(0);
});

When(/^我按下角色「([^」]+)」的連結「([^」]+)」$/, async ({ page, request, state }, name: string, link: string) => {
  state.characterId = (await findSeriesCharacter(request, requireSeriesId(state), name)).id;
  await libraryCard(page, name).getByRole('link', { name: link }).click();
});

Then(/^網址是這個角色的「(.+)」$/, async ({ page, state }, pattern: string) => {
  const expected = pattern.replace(':sid', requireSeriesId(state)).replace(':cid', requireCharacterId(state));
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(expected)}$`));
});

When(/^我透過 API 查詢角色庫，但(.+)$/, async ({ request, state }, situation: string) => {
  if (situation === '系列不存在') state.lastResponse = await request.get('/api/series/no-such-series/characters');
  else if (situation === '篩選條件不在清單') state.lastResponse = await request.get(`/api/series/${requireSeriesId(state)}/characters?scope=nobody`);
  else throw new Error(`沒有這個情況：${situation}`);
});

// ── 角色詳情 ──

When(/^我打開角色「([^」]+)」的詳情$/, async ({ page, request, state }, name: string) => {
  const found = await findSeriesCharacter(request, requireSeriesId(state), name);
  state.characterId = found.id;
  await page.goto(`/series/${requireSeriesId(state)}/characters/${found.id}`);
});

Then(/^頁面標示「([^」]+)」與「([^」]+)」$/, async ({ page }, first: string, second: string) => {
  const header = page.getByRole('banner', { name: '角色' });
  await expect(header.getByText(first, { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(header.getByText(second, { exact: true })).toBeVisible({ timeout: 20_000 });
});

Then(/^頁面標示「([^」]+)」$/, async ({ page }, text: string) => {
  await expect(page.getByRole('banner', { name: '角色' }).getByText(text, { exact: true })).toBeVisible({ timeout: 20_000 });
});

Given(/^我已經透過 API 產生(並確認)?系列角色「([^」]+)」的定裝圖$/, async ({ request, state }, confirm: string | undefined, name: string) => {
  const seriesId = requireSeriesId(state);
  const character = await findSeriesCharacter(request, seriesId, name);
  await generateViaApi(request, seriesId, character.id);
  if (confirm) await confirmViaApi(request, character.id);
  const version = (await fetchVersions(request, character.id)).at(-1);
  state.characterAssets = { sheet: version?.sheetAssetId ?? null, look: version?.lookAssetId ?? null };
});

Given(/^我已經透過 API 把系列角色「([^」]+)」的造型改成「([^」]+)」，產生並確認新版本$/, async ({ request, state }, name: string, look: string) => {
  const seriesId = requireSeriesId(state);
  const character = await findSeriesCharacter(request, seriesId, name);
  const patched = await request.patch(`/api/characters/${character.id}`, {
    data: { identityAnchors: character.version.identityAnchors ?? '七十歲、短白髮', look, continuityLocks: character.version.continuityLocks },
  });
  expect(patched.status()).toBe(200);
  await generateViaApi(request, seriesId, character.id);
  await confirmViaApi(request, character.id);
});

Then(/^版本「([^」]+)」已被選取$/, async ({ page }, label: string) => {
  await expect(page.getByRole('group', { name: '選擇版本' }).getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 });
});

When(/^我按下版本「([^」]+)」$/, async ({ page }, label: string) => {
  await page.getByRole('group', { name: '選擇版本' }).getByRole('button', { name: label, exact: true }).click();
});

Then(/^三視圖與定裝圖是「([^」]+)」(v\d+) 的圖$/, async ({ page, request, state }, name: string, label: string) => {
  const versions = await fetchVersions(request, requireCharacterId(state));
  const version = versions.find((v) => `v${v.version}` === label);
  if (!version) throw new Error(`${name}沒有 ${label}`);
  const sheet = page.getByRole('img', { name: `${name} 三視圖 ${label}`, exact: true });
  const look = page.getByRole('img', { name: `${name} 定裝圖 ${label}`, exact: true });
  await expect(sheet).toHaveAttribute('src', new RegExp(escapeRegExp(version.sheetAssetId ?? 'none')), { timeout: 20_000 });
  await expect(look).toHaveAttribute('src', new RegExp(escapeRegExp(version.lookAssetId ?? 'none')));
});

Then(/^版本說明寫著「(.+)」$/, async ({ page }, text: string) => {
  await expect(page.getByRole('note')).toHaveText(new RegExp(escapeRegExp(text)), { timeout: 20_000 });
});

Then(/^版本說明包含「(.+)」$/, async ({ page }, text: string) => {
  await expect(page.getByRole('note')).toContainText(text);
});

Then(/^角色「([^」]+)」的外觀描述是「([^」]+)」$/, async ({ request, state }, name: string, description: string) => {
  await expect.poll(async () => (await findSeriesCharacter(request, requireSeriesId(state), name)).version.description, { timeout: 15_000 }).toBe(description);
});

Then(/^角色「([^」]+)」的身份錨點是「([^」]+)」，造型是「([^」]+)」$/, async ({ request, state }, name: string, anchors: string, look: string) => {
  const { version } = await findSeriesCharacter(request, requireSeriesId(state), name);
  expect({ anchors: version.identityAnchors, look: version.look }).toEqual({ anchors, look });
});

Then(/^角色「([^」]+)」仍是 v1$/, async ({ request, state }, name: string) => {
  expect((await findSeriesCharacter(request, requireSeriesId(state), name)).version.version).toBe(1);
});

Then(/^角色「([^」]+)」的連續性鎖是「([^」]+)」(?:與「([^」]+)」)?$/, async ({ request, state }, name: string, first: string, second: string | undefined) => {
  const expected = second ? [first, second] : [first];
  await expect.poll(async () => (await findSeriesCharacter(request, requireSeriesId(state), name)).version.continuityLocks, { timeout: 15_000 }).toEqual(expected);
});

When(/^我連按 (\d+) 次「([^」]+)」$/, async ({ page }, times: string, name: string) => {
  for (let i = 0; i < Number(times); i += 1) await page.getByRole('button', { name, exact: true }).click();
});

Then(/^畫面上的「([^」]+)」有內容$/, async ({ page }, label: string) => {
  await expect(page.getByLabel(label, { exact: true })).not.toHaveValue('');
});

// 同意門檻是全域設定，其他情境會並行修改：需要同意時才會跳出費用確認
When(/^我按下「([^」]+)」，需要時在費用確認對話框同意$/, async ({ page }, name: string) => {
  await page.getByRole('button', { name, exact: true }).click();
  const consent = page.getByRole('dialog', { name: '費用確認' });
  const started = page.getByRole('status').filter({ hasText: /生成中|正在產生/ });
  await expect(consent.or(started).first()).toBeVisible({ timeout: 20_000 });
  if (await consent.isVisible()) await consent.getByRole('button', { name: '同意並產生', exact: true }).click();
});

Then(/^角色「([^」]+)」的三視圖換成新的一張，定裝圖沒有換$/, async ({ request, state }, name: string) => {
  const before = state.characterAssets;
  if (!before) throw new Error('還沒有記下原本的圖片');
  const id = (await findSeriesCharacter(request, requireSeriesId(state), name)).id;
  await expect
    .poll(async () => {
      const current = (await fetchVersions(request, id)).at(-1);
      return { sheetChanged: current?.sheetAssetId !== before.sheet && current?.sheetAssetId !== null, lookSame: current?.lookAssetId === before.look };
    }, { timeout: 20_000 })
    .toEqual({ sheetChanged: true, lookSame: true });
});

Then(/^角色「([^」]+)」有 2 個版本，v1 仍是已確認、圖片沒有換$/, async ({ request, state }, name: string) => {
  const before = state.characterAssets;
  if (!before) throw new Error('還沒有記下原本的圖片');
  const id = (await findSeriesCharacter(request, requireSeriesId(state), name)).id;
  await expect.poll(async () => (await fetchVersions(request, id)).length, { timeout: 20_000 }).toBe(2);
  const first = (await fetchVersions(request, id))[0];
  expect(first?.version).toBe(1);
  expect(first?.confirmedAt).not.toBeNull();
  expect({ sheet: first?.sheetAssetId, look: first?.lookAssetId }).toEqual(before);
});

Then(/^「用到這個角色的影片」列出「([^」]+)」，使用 (v\d+)，階段是「([^」]+)」$/, async ({ page }, temple: string, version: string, stage: string) => {
  const row = page
    .getByRole('region', { name: '用到這個角色的影片', exact: true })
    .getByRole('listitem')
    .filter({ has: page.getByRole('link', { name: new RegExp(`^${escapeRegExp(temple)}`) }) });
  await expect(row.getByText(`使用 ${version}`, { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(row.getByText(stage, { exact: true })).toBeVisible();
});

When(/^我在「用到這個角色的影片」按下「([^」]+)」$/, async ({ page }, temple: string) => {
  await page
    .getByRole('region', { name: '用到這個角色的影片', exact: true })
    .getByRole('link', { name: new RegExp(`^${escapeRegExp(temple)}`) })
    .click();
});

When(/^我透過 API 操作系列角色「([^」]+)」，但(.+)$/, async ({ request, state }, name: string, situation: string) => {
  const character = await findSeriesCharacter(request, requireSeriesId(state), name);
  switch (situation) {
    case '重生三視圖沒有同意憑證':
      state.lastResponse = await request.post(`/api/characters/${character.id}/generate`, { data: { part: 'sheet' } });
      return;
    case '重生定裝圖沒有同意憑證':
      state.lastResponse = await request.post(`/api/characters/${character.id}/generate`, { data: { part: 'look' } });
      return;
    case '重生的部分不在清單':
      state.lastResponse = await request.post(`/api/characters/${character.id}/generate`, { data: { part: 'hair' } });
      return;
    case '角色不存在時查版本':
      state.lastResponse = await request.get('/api/characters/no-such-character/versions');
      return;
    case '角色不存在時查用到的影片':
      state.lastResponse = await request.get('/api/characters/no-such-character/usage');
      return;
    case '連續性鎖超過 10 條':
      state.lastResponse = await request.patch(`/api/characters/${character.id}`, {
        data: { identityAnchors: '七十歲', look: '深藍布衫', continuityLocks: Array.from({ length: 11 }, (_, i) => `lock number ${i}`) },
      });
      return;
    default:
      throw new Error(`沒有這個情況：${situation}`);
  }
});

// ── 過去的影片分頁 ──

function videoCard(page: Page, temple: string): Locator {
  return page.getByRole('article').filter({ has: page.getByRole('heading', { name: new RegExp(`^${escapeRegExp(temple)}`) }) });
}

Then(/^影片卡「([^」]+)」標示狀態「([^」]+)」$/, async ({ page }, temple: string, status: string) => {
  await expect(videoCard(page, temple).getByText(status, { exact: true })).toBeVisible({ timeout: 20_000 });
});

Then(/^影片卡「([^」]+)」寫著「([^」]+)」$/, async ({ page }, temple: string, text: string) => {
  await expect(videoCard(page, temple).getByText(text, { exact: true })).toBeVisible({ timeout: 20_000 });
});

Then(/^影片卡「([^」]+)」寫著模型「([^」]+)」$/, async ({ page }, temple: string, models: string) => {
  await expect(videoCard(page, temple).getByText(models, { exact: true })).toBeVisible({ timeout: 20_000 });
});

Then(/^影片卡「([^」]+)」寫著(更新時間|成品長度)$/, async ({ page }, temple: string, what: string) => {
  const pattern = what === '更新時間' ? /(更新於|完成於) \d{4}-\d{2}-\d{2} \d{2}:\d{2}/ : /^\d+:\d{2}$/;
  await expect(videoCard(page, temple).getByText(pattern).first()).toBeVisible({ timeout: 20_000 });
});

Then(/^頁面有「([^」]+)」連結$/, async ({ page }, name: string) => {
  await expect(page.getByRole('link', { name, exact: true })).toBeVisible({ timeout: 20_000 });
});

Given(/^我已經透過 API 確認這支影片的成品$/, async ({ request, state }) => {
  const id = state.videoIds?.at(-1);
  if (!id) throw new Error('這個場景還沒有建立影片');
  expect((await request.post(`/api/videos/${id}/final/confirm`)).status()).toBe(200);
});

Given(/^我為同一個系列另外建立一支「([^」]+)」的影片$/, async ({ request, state }, temple: string) => {
  const { response } = await createVideoViaApi(request, requireSeriesId(state), temple);
  expect(response.status()).toBe(201);
  state.videoIds = [...(state.videoIds ?? []), await videoIdFrom(response)];
});

Then(/^影片列表只列出影片卡「([^」]+)」(?:，標示狀態「([^」]+)」)?$/, async ({ page }, temple: string, status: string | undefined) => {
  await expect(page.getByRole('article')).toHaveCount(1, { timeout: 20_000 });
  await expect(videoCard(page, temple)).toBeVisible();
  if (status) await expect(videoCard(page, temple).getByText(status, { exact: true })).toBeVisible();
});

Then(/^影片列表依序是「([^」]+)」、「([^」]+)」$/, async ({ page }, first: string, second: string) => {
  const headings = page.getByRole('article').getByRole('heading', { level: 2 });
  await expect(headings).toHaveCount(2, { timeout: 20_000 });
  await expect(headings.nth(0)).toHaveText(new RegExp(`^${escapeRegExp(first)}`));
  await expect(headings.nth(1)).toHaveText(new RegExp(`^${escapeRegExp(second)}`));
});

When(/^我把排序換成「([^」]+)」$/, async ({ page }, option: string) => {
  await page.getByLabel('排序', { exact: true }).selectOption({ label: option });
});

When(/^我在影片卡「([^」]+)」按下「([^」]+)」$/, async ({ page }, temple: string, name: string) => {
  const card = videoCard(page, temple);
  const target = card.getByRole('link', { name: new RegExp(`^${escapeRegExp(name)}`) }).or(card.getByRole('button', { name: new RegExp(`^${escapeRegExp(name)}`) }));
  await target.first().click();
});

Then(/^影片卡「([^」]+)」(有|沒有)標籤「([^」]+)」$/, async ({ page }, temple: string, has: string, tag: string) => {
  const card = videoCard(page, temple);
  await expect(card).toBeVisible({ timeout: 20_000 });
  if (has === '有') await expect(card.getByText(tag, { exact: true })).toBeVisible();
  else await expect(card.getByText(tag, { exact: true })).toHaveCount(0);
});

Then(/^影片卡「([^」]+)」(有|沒有)下載按鈕$/, async ({ page }, temple: string, has: string) => {
  const card = videoCard(page, temple);
  await expect(card).toBeVisible({ timeout: 20_000 });
  const download = card.getByRole('link', { name: /^下載/ });
  if (has === '有') await expect(download).toBeVisible();
  else await expect(download).toHaveCount(0);
});

When(/^我在影片卡「([^」]+)」按下下載按鈕並取得下載的檔案$/, async ({ page, state }, temple: string) => {
  const downloading = page.waitForEvent('download');
  await videoCard(page, temple).getByRole('link', { name: /^下載/ }).click();
  const download = await downloading;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  state.downloaded = { filename: download.suggestedFilename(), bytes: Buffer.concat(chunks) };
});

When(/^我透過 API 查詢過去的影片，但(.+)$/, async ({ request, state }, situation: string) => {
  if (situation === '系列不存在') state.lastResponse = await request.get('/api/series/no-such-series/videos');
  else if (situation === '狀態不在清單') state.lastResponse = await request.get(`/api/series/${requireSeriesId(state)}/videos?status=nobody`);
  else if (situation === '排序不在清單') state.lastResponse = await request.get(`/api/series/${requireSeriesId(state)}/videos?sort=nobody`);
  else throw new Error(`沒有這個情況：${situation}`);
});
