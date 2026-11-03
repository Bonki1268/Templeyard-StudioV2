import { expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';
import { planResponseSchema, planVersionResponseSchema, type Plan, type ShotInput } from '@templeyard/shared';
import { Given, Then, When } from './fixtures';
import {
  chatViaApi,
  confirmBoardViaApi,
  createSeriesViaApi,
  createVideoViaApi,
  fakeClaudeRequests,
  fetchQuestionnaire,
  videoIdFrom,
} from './support/api';

// 第 7 階段：分鏡方案、時間軸、秒數檢查

type State = { seriesId?: string; seriesName?: string; videoIds?: string[]; lastResponse?: APIResponse };

const STORY_ROLE = '導演兼分鏡師';
const AGENT_ROLE = '廟埕影室的創作 Agent';

function requireVideoId(state: State): string {
  const id = state.videoIds?.at(-1);
  if (!id) throw new Error('這個場景還沒有建立影片');
  return id;
}

function card(page: Page, seq: string | number) {
  return page.getByRole('list', { name: '分鏡卡片' }).getByRole('article', { name: `第 ${seq} 格`, exact: true });
}

function timeline(page: Page) {
  return page.getByRole('region', { name: '時間軸' });
}

function blockers(page: Page) {
  return page.getByRole('list', { name: '還不能生成的原因' }).getByRole('listitem');
}

async function fetchPlan(request: APIRequestContext, videoId: string) {
  const response = await request.get(`/api/videos/${videoId}/plan`);
  expect(response.status()).toBe(200);
  return planResponseSchema.parse(await response.json());
}

async function fetchPlanVersion(request: APIRequestContext, videoId: string, version: number): Promise<Plan> {
  const response = await request.get(`/api/videos/${videoId}/plan/versions/${version}`);
  expect(response.status()).toBe(200);
  return planVersionResponseSchema.parse(await response.json()).plan;
}

function inputsOf(plan: Plan): ShotInput[] {
  return plan.shots.map(({ seq: _seq, startSec: _start, dialogueEstimateSec: _estimate, ...rest }) => rest);
}

/** 依現行方案修改，新增一個版本 */
async function modifyPlan(request: APIRequestContext, videoId: string, mutate: (shots: ShotInput[]) => ShotInput[]) {
  const { plan } = await fetchPlan(request, videoId);
  if (!plan) throw new Error('這支影片還沒有分鏡方案');
  const response = await request.post(`/api/videos/${videoId}/plan/versions`, { data: { baseVersion: plan.version, shots: mutate(inputsOf(plan)) } });
  expect(response.status()).toBe(201);
}

async function submitQuestionnaire(request: APIRequestContext, videoId: string, length = '30 秒') {
  const response = await request.put(`/api/videos/${videoId}/questionnaire`, {
    data: {
      answers: [
        { questionId: 'story', custom: '講媽祖顯靈救漁民的故事' },
        { questionId: 'audience', choice: '外地遊客' },
        { questionId: 'tone', choice: '溫暖' },
        { questionId: 'length', choice: length },
      ],
    },
  });
  expect(response.status()).toBe(200);
}

// ── 準備 ──

Given(/^我已經為一支「(.+)」的影片建立分鏡方案$/, async ({ request, state }, temple: string) => {
  const series = await createSeriesViaApi(request);
  state.seriesId = series.id;
  state.seriesName = series.name;
  const { response } = await createVideoViaApi(request, series.id, temple);
  expect(response.status()).toBe(201);
  const videoId = await videoIdFrom(response);
  state.videoIds = [...(state.videoIds ?? []), videoId];
  await confirmBoardViaApi(request, videoId);
  expect((await chatViaApi(request, videoId, '講媽祖顯靈救漁民的故事')).at(-1)?.type).toBe('done');
  await submitQuestionnaire(request, videoId);
  const generated = await request.post(`/api/videos/${videoId}/plan/generate`);
  expect(generated.status()).toBe(201);
});

Given('這支影片已經有分鏡方案', async ({ request, state }) => {
  const videoId = requireVideoId(state);
  expect((await chatViaApi(request, videoId, '講媽祖的故事')).at(-1)?.type).toBe('done');
  await submitQuestionnaire(request, videoId);
  expect((await request.post(`/api/videos/${videoId}/plan/generate`)).status()).toBe(201);
});

Given(/^這支影片的問卷「長度」是「(.+)」$/, async ({ request, state }, length: string) => {
  const videoId = requireVideoId(state);
  expect(await fetchQuestionnaire(request, videoId)).not.toBeNull();
  await submitQuestionnaire(request, videoId, length);
});

When('我透過 API 產生分鏡方案', async ({ request, state }) => {
  state.lastResponse = await request.post(`/api/videos/${requireVideoId(state)}/plan/generate`);
});

Given(/^我透過 API 把方案的第 (\d+) 格台詞改成「(.+)」$/, async ({ request, state }, seq: string, dialogue: string) => {
  await modifyPlan(request, requireVideoId(state), (shots) => shots.map((s, i) => (i === Number(seq) - 1 ? { ...s, dialogue, subtitle: dialogue } : s)));
});

Given(/^我透過 API 把方案改成(.+)$/, async ({ request, state }, situation: string) => {
  const videoId = requireVideoId(state);
  const at = (index: number, patch: Partial<ShotInput>) => (shots: ShotInput[]) => shots.map((s, i) => (i === index ? { ...s, ...patch } : s));
  const cases: Record<string, (shots: ShotInput[]) => ShotInput[]> = {
    '第 1 格 20 秒': at(0, { durationSec: 20 }),
    '第 1 格沒有畫面內容': at(0, { description: '' }),
    '第 4 格缺少視角「後殿」': at(3, { viewKey: 'missing:後殿' }),
    '第 4 格使用「廟前全景」': at(3, { viewKey: 'front_overview' }),
  };
  const mutate = cases[situation];
  if (!mutate) throw new Error(`沒有這個情況：${situation}`);
  await modifyPlan(request, videoId, mutate);
});

When(/^我透過 API 修改方案，但(.+)$/, async ({ request, state }, situation: string) => {
  const videoId = requireVideoId(state);
  const { plan } = await fetchPlan(request, videoId);
  if (!plan) throw new Error('這支影片還沒有分鏡方案');
  const shots = inputsOf(plan);
  const payloads: Record<string, unknown> = {
    不是根據最新的版本修改: { baseVersion: plan.version + 1, shots },
    '有一格不到 1 秒': { baseVersion: plan.version, shots: [{ ...shots[0], durationSec: 0 }] },
    沒有任何一格: { baseVersion: plan.version, shots: [] },
    回到不存在的版本: { baseVersion: plan.version, revertTo: 99 },
  };
  const data = payloads[situation];
  if (data === undefined) throw new Error(`沒有這個情況：${situation}`);
  if (situation === '不是根據最新的版本修改') {
    // 先有人改出新的一版，再用舊的版本號送出
    await modifyPlan(request, videoId, (s) => s);
    state.lastResponse = await request.post(`/api/videos/${videoId}/plan/versions`, { data: { baseVersion: plan.version, shots } });
    return;
  }
  state.lastResponse = await request.post(`/api/videos/${videoId}/plan/versions`, { data });
});

// ── 方案面板 ──

Then(/^方案有 (\d+) 格分鏡卡片$/, async ({ page }, count: string) => {
  await expect(page.getByRole('list', { name: '分鏡卡片' }).getByRole('article')).toHaveCount(Number(count));
});

Then(/^「([^」]+)」目前是「(.+)」$/, async ({ page }, label: string, text: string) => {
  const select = page.getByLabel(label, { exact: true });
  await expect.poll(async () => select.evaluate((el) => (el as HTMLSelectElement).selectedOptions[0]?.textContent ?? '')).toBe(text);
});

Then(/^「([^」]+)」的選項有「(.+)」$/, async ({ page }, label: string, option: string) => {
  await expect(page.getByLabel(label, { exact: true }).getByRole('option', { name: option, exact: true })).toHaveCount(1);
});

When(/^我在方案版本選單選擇「(.+)」$/, async ({ page }, option: string) => {
  await page.getByLabel('方案版本', { exact: true }).selectOption({ label: option });
});

Then(/^「([^」]+)」是「(.+)」$/, async ({ page }, label: string, text: string) => {
  const select = page.getByLabel(label, { exact: true });
  await expect.poll(async () => select.evaluate((el) => (el as HTMLSelectElement).selectedOptions[0]?.textContent ?? '')).toBe(text);
});

Then('方案的「風格」卡顯示這個系列的整體視覺風格', async ({ page }) => {
  // createSeriesViaApi 的整體視覺風格
  await expect(page.getByRole('region', { name: '風格', exact: true }).getByText('寫實電影感、清晨暖光', { exact: true })).toBeVisible();
});

Then(/^方案的「(角色|場景)」卡列出「(.+)」$/, async ({ page }, name: string, item: string) => {
  await expect(page.getByRole('region', { name, exact: true }).getByText(item, { exact: true })).toBeVisible();
});
Then(/^第 (\d+) 格的標題是「(.+)」$/, async ({ page }, seq: string, title: string) => {
  await expect(card(page, seq).getByRole('heading', { name: title, exact: true })).toBeVisible();
});

Then(/^第 (\d+) 格(?:標示|顯示)「(.+)」$/, async ({ page }, seq: string, text: string) => {
  await expect(card(page, seq).getByText(text, { exact: true })).toBeVisible();
});

When('我離開這個欄位，等方案存成新版本', async ({ page }) => {
  await page.keyboard.press('Tab');
  await expect(page.getByRole('status').filter({ hasText: /^已存成第 \d+ 版$/ })).toBeVisible();
});

When(/^我把第 (\d+) 格拖到第 (\d+) 格的位置$/, async ({ page }, from: string, to: string) => {
  await card(page, from).dragTo(card(page, to));
});

When(/^我把時間軸「(.+)」往(前|後)移 (\d+) 秒$/, async ({ page }, boundary: string, direction: string, seconds: string) => {
  const slider = timeline(page).getByRole('slider', { name: boundary, exact: true });
  await slider.focus();
  for (let i = 0; i < Number(seconds); i += 1) await slider.press(direction === '後' ? 'ArrowRight' : 'ArrowLeft');
});

Then(/^時間軸有 (\d+) 格$/, async ({ page }, count: string) => {
  await expect(timeline(page).getByRole('listitem')).toHaveCount(Number(count));
});

Then(/^時間軸顯示「(.+)」$/, async ({ page }, text: string) => {
  await expect(timeline(page).getByText(text, { exact: true })).toBeVisible();
});

Then(/^還不能生成的原因包含「(.+)」$/, async ({ page }, reason: string) => {
  await expect(blockers(page).filter({ hasText: reason })).toHaveCount(1);
});

Then('還不能生成的原因不包含第 3 格', async ({ page }) => {
  await expect(blockers(page).first()).toBeVisible();
  await expect(blockers(page).filter({ hasText: /^第 3 格/ })).toHaveCount(0);
});

Then(/^還不能生成的原因只有「(.+)」$/, async ({ page }, reason: string) => {
  await expect(blockers(page)).toHaveText([reason]);
});

// ── API ──

Then('這支影片還沒有分鏡方案', async ({ request, state }) => {
  expect((await fetchPlan(request, requireVideoId(state))).plan).toBeNull();
});

Then(/^這支影片的方案仍是第 (\d+) 版$/, async ({ request, state }, version: string) => {
  expect((await fetchPlan(request, requireVideoId(state))).plan?.version).toBe(Number(version));
});

Then(/^方案第 (\d+) 版的第 1 格和第 (\d+) 版是同一格$/, async ({ request, state }, a: string, b: string) => {
  const videoId = requireVideoId(state);
  const [left, right] = await Promise.all([fetchPlanVersion(request, videoId, Number(a)), fetchPlanVersion(request, videoId, Number(b))]);
  expect(left.shots[0]?.shotKey).toBe(right.shots[0]?.shotKey);
});

Then(/^方案第 (\d+) 版的格子識別碼和第 (\d+) 版相同，只有順序不同$/, async ({ request, state }, a: string, b: string) => {
  const videoId = requireVideoId(state);
  const [left, right] = await Promise.all([fetchPlanVersion(request, videoId, Number(a)), fetchPlanVersion(request, videoId, Number(b))]);
  const keys = (plan: Plan) => plan.shots.map((s) => s.shotKey);
  expect([...keys(left)].sort()).toEqual([...keys(right)].sort());
  expect(keys(left)).not.toEqual(keys(right));
});

Then(/^假的 Claude 收到 (\d+) 次分鏡方案的請求$/, async ({ request }, count: string) => {
  // 這個請求的故事是場景專用的測試文字
  const mine = (await fakeClaudeRequests(request)).filter((r) => r.system.includes(STORY_ROLE) && r.user.includes('測試：方案格式錯誤'));
  expect(mine).toHaveLength(Number(count));
});

Then(/^假的 Claude 收到的 Agent 工具包含「(.+)」$/, async ({ request, state }, name: string) => {
  const seriesName = state.seriesName;
  if (!seriesName) throw new Error('這個場景還沒有建立系列');
  const mine = (await fakeClaudeRequests(request)).filter((r) => r.system.includes(AGENT_ROLE) && r.system.includes(seriesName));
  expect(mine.at(-1)?.tools).toContain(name);
  expect(mine.at(-1)?.tools).not.toContain('generate_frames');
});

Then(/^對話裡有「(.+)」$/, async ({ page }, text: string) => {
  await expect(page.getByRole('region', { name: '對話' }).getByRole('article', { name: 'Agent 說' }).filter({ hasText: text })).toHaveCount(1);
});

When(/^我透過 API 對這支影片的 Agent 說「(.+)」$/, async ({ request, state }, content: string) => {
  expect((await chatViaApi(request, requireVideoId(state), content)).at(-1)?.type).toBe('done');
});
