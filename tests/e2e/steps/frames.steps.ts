import { expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';
import { characterListResponseSchema, framesResponseSchema, planResponseSchema, templeBoardResponseSchema, type ShotInput } from '@templeyard/shared';
import { Given, Then, When } from './fixtures';
import { chatViaApi, confirmBoardViaApi, consentViaApi, createSeriesViaApi, createVideoViaApi, fetchVideoDetail, videoIdFrom } from './support/api';

// 第 9 階段：精緻圖、生成中、通知

type State = {
  seriesId?: string;
  seriesName?: string;
  videoIds?: string[];
  lastResponse?: APIResponse;
  /** 確認時記下每格首格的檔案編號（依序號） */
  frameAssets?: Record<number, string | null>;
};

const FAKE_COMFY_URL = 'http://127.0.0.1:3401';

function requireVideoId(state: State): string {
  const id = state.videoIds?.at(-1);
  if (!id) throw new Error('這個場景還沒有建立影片');
  return id;
}

function frameCard(page: Page, seq: string | number) {
  return page.getByRole('list', { name: '精緻圖' }).getByRole('article', { name: `第 ${seq} 格`, exact: true });
}

function clipBlockers(page: Page) {
  return page.getByRole('list', { name: '還不能生成影片的原因' }).getByRole('listitem');
}

async function fetchFrames(request: APIRequestContext, videoId: string) {
  const response = await request.get(`/api/videos/${videoId}/frames`);
  expect(response.status()).toBe(200);
  return framesResponseSchema.parse(await response.json());
}

async function modifyPlan(request: APIRequestContext, videoId: string, mutate: (shots: ShotInput[]) => ShotInput[]) {
  const response = await request.get(`/api/videos/${videoId}/plan`);
  const { plan } = planResponseSchema.parse(await response.json());
  if (!plan) throw new Error('這支影片還沒有分鏡方案');
  const shots = plan.shots.map(({ seq: _s, startSec: _t, dialogueEstimateSec: _d, ...rest }) => rest);
  const saved = await request.post(`/api/videos/${videoId}/plan/versions`, { data: { baseVersion: plan.version, shots: mutate(shots) } });
  expect(saved.status()).toBe(201);
}

/** 方案、確認阿嬤、第 4 格改用廟前全景：秒數與角色檢查都通過 */
async function readyPlan(request: APIRequestContext, state: State, temple: string, slow = false) {
  const series = await createSeriesViaApi(request);
  state.seriesId = series.id;
  state.seriesName = series.name;
  const { response } = await createVideoViaApi(request, series.id, temple);
  expect(response.status()).toBe(201);
  const videoId = await videoIdFrom(response);
  state.videoIds = [...(state.videoIds ?? []), videoId];
  await confirmBoardViaApi(request, videoId);
  expect((await chatViaApi(request, videoId, '講媽祖顯靈救漁民的故事')).at(-1)?.type).toBe('done');
  const submitted = await request.put(`/api/videos/${videoId}/questionnaire`, { data: { answers: [{ questionId: 'story', custom: '講媽祖顯靈救漁民的故事' }] } });
  expect(submitted.status()).toBe(200);
  expect((await request.post(`/api/videos/${videoId}/plan/generate`)).status()).toBe(201);

  const characters = characterListResponseSchema.parse(await (await request.get(`/api/videos/${videoId}/characters`)).json()).characters;
  for (const character of characters) {
    const consentToken = await consentViaApi(request, videoId, 2);
    expect((await request.post(`/api/characters/${character.id}/generate`, { data: { videoId, consentToken } })).status()).toBe(202);
    await expect
      .poll(async () => characterListResponseSchema.parse(await (await request.get(`/api/videos/${videoId}/characters`)).json()).characters.find((c) => c.id === character.id)?.state, { timeout: 15_000 })
      .toBe('pending_confirm');
    expect((await request.post(`/api/characters/${character.id}/confirm`)).status()).toBe(200);
  }
  await modifyPlan(request, videoId, (shots) =>
    shots.map((shot, index) => ({
      ...shot,
      viewKey: shot.viewKey?.startsWith('missing:') ? 'front_overview' : shot.viewKey,
      description: slow && index === 0 ? `${shot.description ?? ''} [slow]` : shot.description,
    })),
  );
  return videoId;
}

async function submitFrames(request: APIRequestContext, videoId: string) {
  const { shots } = await fetchFrames(request, videoId);
  const consentToken = await consentViaApi(request, videoId, shots.length);
  const response = await request.post(`/api/videos/${videoId}/generate/frames`, { data: { consentToken } });
  expect(response.status()).toBe(202);
}

// ── 準備 ──

Given(/^我已經為一支「(.+)」的影片準備好可以生成的分鏡方案$/, async ({ request, state }, temple: string) => {
  await readyPlan(request, state, temple);
});

Given(/^我已經為一支「(.+)」的影片準備好可以生成的分鏡方案，而且生成會花比較久$/, async ({ request, state }, temple: string) => {
  await readyPlan(request, state, temple, true);
});

Given('我已經透過 API 送出精緻圖生成', async ({ request, state }) => {
  await submitFrames(request, requireVideoId(state));
});

Given(/^我已經透過 API 為一支「(.+)」的影片產生精緻圖$/, async ({ request, state }, temple: string) => {
  const videoId = await readyPlan(request, state, temple);
  await submitFrames(request, videoId);
  await expect.poll(async () => (await fetchFrames(request, videoId)).generating, { timeout: 20_000 }).toBe(false);
});

Given('我透過 API 確認所有格的精緻圖', async ({ request, state }) => {
  const videoId = requireVideoId(state);
  const { shots } = await fetchFrames(request, videoId);
  state.frameAssets = {};
  for (const shot of shots) {
    expect((await request.post(`/api/videos/${videoId}/shots/${shot.shotKey}/frames/confirm`)).status()).toBe(200);
    state.frameAssets[shot.seq] = shot.first?.assetId ?? null;
  }
});

When(/^我透過 API 把「(.+)」的外觀描述改成「(.+)」$/, async ({ request, state }, name: string, description: string) => {
  const videoId = requireVideoId(state);
  const characters = characterListResponseSchema.parse(await (await request.get(`/api/videos/${videoId}/characters`)).json()).characters;
  const character = characters.find((c) => c.name === name);
  if (!character) throw new Error(`沒有角色：${name}`);
  const response = await request.patch(`/api/characters/${character.id}`, { data: { description, continuityLocks: character.version.continuityLocks } });
  expect(response.status()).toBe(200);
});

Given(/^瀏覽器(允許|不允許)通知$/, async ({ page }, allowed: string) => {
  const permission = allowed === '允許' ? 'granted' : 'denied';
  await page.addInitScript((granted: string) => {
    const shown: string[] = [];
    (window as unknown as { __notifications: string[] }).__notifications = shown;
    class FakeNotification {
      static permission = granted;
      static requestPermission = async () => granted;
      constructor(title: string) {
        shown.push(title);
      }
    }
    (window as unknown as { Notification: unknown }).Notification = FakeNotification;
  }, permission);
});

When(/^我透過 API 生成精緻圖，但(.+)$/, async ({ request, state }, situation: string) => {
  const videoId = requireVideoId(state);
  const url = `/api/videos/${videoId}/generate/frames`;
  switch (situation) {
    case '沒有同意憑證':
    case '方案檢查還沒通過':
      state.lastResponse = await request.post(url, { data: {} });
      return;
    case '正在生成':
      // 讓第 1 格久一點，第二次送出時一定還在生成
      await modifyPlan(request, videoId, (shots) => shots.map((shot, index) => (index === 0 ? { ...shot, description: `${shot.description ?? ''} [slow]` } : shot)));
      await submitFrames(request, videoId);
      state.lastResponse = await request.post(url, { data: { consentToken: await consentViaApi(request, videoId, 4) } });
      return;
    default:
      throw new Error(`沒有這個情況：${situation}`);
  }
});

// ── 生成中與精緻圖面板 ──

Then('生成中面板沒有任何精緻圖', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 2, name: '生成中', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: /首格$/ })).toHaveCount(0);
});

Then(/^等生成完成後，面板標題是「(.+)」$/, async ({ page }, title: string) => {
  await expect(page.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible({ timeout: 20_000 });
});

Then(/^精緻圖有 (\d+) 格，每格都有首格$/, async ({ page }, count: string) => {
  const cards = page.getByRole('list', { name: '精緻圖' }).getByRole('article');
  await expect(cards).toHaveCount(Number(count), { timeout: 20_000 });
  for (let seq = 1; seq <= Number(count); seq += 1) {
    await expect(frameCard(page, seq).getByRole('img', { name: `第 ${seq} 格首格`, exact: true })).toBeVisible();
  }
});

Then(/^精緻圖的第 (\d+) 格標示「(.+)」$/, async ({ page }, seq: string, tag: string) => {
  await expect(frameCard(page, seq).getByText(tag, { exact: true })).toBeVisible({ timeout: 20_000 });
});

Then(/^精緻圖的第 (\d+) 格換成新的首格$/, async ({ page, state }, seq: string) => {
  const before = state.frameAssets?.[Number(seq)];
  if (!before) throw new Error('沒有記下原本的首格');
  const image = frameCard(page, seq).getByRole('img', { name: `第 ${seq} 格首格`, exact: true });
  await expect(image).toBeVisible({ timeout: 20_000 });
  await expect(image).not.toHaveAttribute('src', new RegExp(before), { timeout: 20_000 });
});

Then(/^還不能生成影片的原因包含「(.+)」$/, async ({ page }, reason: string) => {
  await expect(clipBlockers(page).filter({ hasText: reason })).toHaveCount(1, { timeout: 20_000 });
});

Then(/^還不能生成影片的原因只有「(.+)」$/, async ({ page }, reason: string) => {
  await expect(clipBlockers(page)).toHaveText([reason]);
});

Then('沒有還不能生成的原因', async ({ page }) => {
  await expect(page.getByRole('button', { name: '生成', exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: '還不能生成的原因' }).getByRole('listitem')).toHaveCount(0);
});

// ── 通知 ──

Then(/^瀏覽器顯示通知「(.+)」$/, async ({ page }, title: string) => {
  await expect.poll(async () => page.evaluate(() => (window as unknown as { __notifications: string[] }).__notifications), { timeout: 20_000 }).toContain(title);
});

Then('瀏覽器沒有顯示通知', async ({ page }) => {
  expect(await page.evaluate(() => (window as unknown as { __notifications: string[] }).__notifications)).toEqual([]);
});

// ── 參考圖與原圖 ──

type FakeCalls = { calls: { tool?: string; args?: Record<string, unknown> }[]; uploads: { ref: string; filename: string }[] };

async function fakeComfy(request: APIRequestContext): Promise<FakeCalls> {
  const response = await request.get(`${FAKE_COMFY_URL}/__calls`);
  expect(response.status()).toBe(200);
  return (await response.json()) as FakeCalls;
}

Then(/^第 (\d+) 格精緻圖的參考圖有「(.+)」的定裝圖與「(.+)」的視角圖$/, async ({ request, state }, _seq: string, name: string, view: string) => {
  const videoId = requireVideoId(state);
  const characters = characterListResponseSchema.parse(await (await request.get(`/api/videos/${videoId}/characters`)).json()).characters;
  const look = characters.find((c) => c.name === name)?.version.lookAssetId;
  const board = templeBoardResponseSchema.parse(await (await request.get(`/api/videos/${videoId}/temple-board`)).json()).board;
  const viewAsset = board.views.find((v) => v.viewName === view)?.assetId;
  if (!look || !viewAsset) throw new Error('找不到定裝圖或視角圖');
  const { calls, uploads } = await fakeComfy(request);
  const fileOf = new Map(uploads.map((u) => [u.ref, u.filename]));
  const referenceSets = calls
    .filter((c) => c.tool === 'partner_generate' && c.args?.confirm === true && Array.isArray(c.args?.fake_reference_images))
    .map((c) => (c.args?.fake_reference_images as unknown[]).map((ref) => fileOf.get(String(ref))));
  expect(referenceSets.some((files) => files.includes(`${look}.png`) && files.includes(`${viewAsset}.png`))).toBe(true);
});

Then('假的雲端沒有收到任何原圖', async ({ request, state }) => {
  const detail = await fetchVideoDetail(request, requireVideoId(state));
  const originals = detail.photos.map((photo) => photo.originalAssetId);
  expect(originals.length).toBeGreaterThan(0);
  const { uploads } = await fakeComfy(request);
  expect(uploads.filter((u) => originals.some((id) => u.filename.startsWith(id)))).toEqual([]);
});
