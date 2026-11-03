import { expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';
import { QUESTIONNAIRE_QUESTIONS, findQuestion, type AnswerInput } from '@templeyard/shared';
import type { DataTable } from 'playwright-bdd';
import { Given, Then, When } from './fixtures';
import {
  chatViaApi,
  confirmBoardViaApi,
  createSeriesViaApi,
  createVideoViaApi,
  fakeClaudeRequests,
  fetchQuestionnaire,
  fetchSeriesDefaults,
  fetchVideoDetail,
  generateBoardViaApi,
  videoIdFrom,
} from './support/api';

// 第 6 階段：創作工作區、創作對話、問卷、AI 輔助撰寫

type State = {
  seriesId?: string;
  seriesName?: string;
  videoIds?: string[];
  lastResponse?: APIResponse;
  aiSuggestion?: string;
  assistLogId?: string;
};

const AGENT_ROLE = '廟埕影室的創作 Agent';

function requireVideoId(state: State): string {
  const id = state.videoIds?.at(-1);
  if (!id) throw new Error('這個場景還沒有建立影片');
  return id;
}

function requireSeriesId(state: State): string {
  if (!state.seriesId) throw new Error('這個場景還沒有建立系列');
  return state.seriesId;
}

function questionIdOf(title: string): string {
  const question = QUESTIONNAIRE_QUESTIONS.find((q) => q.title === title);
  if (!question) throw new Error(`題庫沒有這一題：${title}`);
  return question.id;
}

function chatLog(page: Page) {
  return page.getByRole('region', { name: '對話' });
}

function suggestionRegion(page: Page) {
  return page.getByRole('region', { name: /^AI 建議/ });
}

function questionRegion(page: Page, title: string) {
  return page.getByRole('region', { name: `問卷題目：${title}` });
}

/** 建立一支影片並確認定裝版；newSeries 為 false 時用這個場景的系列 */
async function confirmedVideo(request: APIRequestContext, state: State, temple: string, newSeries: boolean) {
  if (newSeries || !state.seriesId) {
    const series = await createSeriesViaApi(request);
    state.seriesId = series.id;
    state.seriesName = series.name;
  }
  const { response } = await createVideoViaApi(request, requireSeriesId(state), temple);
  expect(response.status()).toBe(201);
  const videoId = await videoIdFrom(response);
  state.videoIds = [...(state.videoIds ?? []), videoId];
  await confirmBoardViaApi(request, videoId);
  return videoId;
}

async function openStudio(page: Page, state: State, panel?: string) {
  await page.goto(`/videos/${requireVideoId(state)}/studio${panel ? `?panel=${panel}` : ''}`);
}

async function chatAndExpectDone(request: APIRequestContext, state: State, content: string) {
  const events = await chatViaApi(request, requireVideoId(state), content);
  expect(events.at(-1)?.type).toBe('done');
}

/** 每一題都有作答：選項題選第一個、文字題寫一句、照片勾第一張 */
async function answerEverything(request: APIRequestContext, videoId: string): Promise<AnswerInput[]> {
  const questionnaire = await fetchQuestionnaire(request, videoId);
  const detail = await fetchVideoDetail(request, videoId);
  const answers = questionnaire?.answers ?? QUESTIONNAIRE_QUESTIONS.map((q) => ({ questionId: q.id }));
  return answers.map(({ questionId }) => {
    const question = findQuestion(questionId);
    if (!question) throw new Error(`題庫沒有這一題：${questionId}`);
    if (question.kind === 'choice') return { questionId, choice: question.options[0] };
    if (question.kind === 'photos') return { questionId, photoIds: detail.photos.slice(0, 1).map((p) => p.id) };
    return { questionId, custom: '測試用的內容' };
  });
}

// ── 準備 ──

Given(/^我已經為一支「(.+)」的影片確認寺廟定裝版$/, async ({ request, state }, temple: string) => {
  await confirmedVideo(request, state, temple, true);
});

Given(/^我為同一個系列的另一支「(.+)」影片確認寺廟定裝版$/, async ({ request, state }, temple: string) => {
  await confirmedVideo(request, state, temple, false);
});

Given(/^我已經透過 API 對這支影片的 Agent 說「(.+)」$/, async ({ request, state }, content: string) => {
  await chatAndExpectDone(request, state, content);
});

When(/^我打開這支影片的創作工作區的「(.+)」面板$/, async ({ page, state }, panel: string) => {
  await openStudio(page, state, panel);
});

Given(/^我在(首頁的建立系列表單|建立影片頁選好寺廟|定裝版頁修改「廟前全景」|創作首頁|問卷)$/, async ({ page, request, state }, where: string) => {
  switch (where) {
    case '首頁的建立系列表單':
      await page.goto('/');
      return;
    case '建立影片頁選好寺廟': {
      const series = await createSeriesViaApi(request);
      state.seriesId = series.id;
      const { response } = await createVideoViaApi(request, series.id, '板橋慈惠宮');
      const videoId = await videoIdFrom(response);
      state.videoIds = [videoId];
      await page.goto(`/series/${series.id}/videos/new?video=${videoId}`);
      return;
    }
    case '定裝版頁修改「廟前全景」': {
      const series = await createSeriesViaApi(request);
      state.seriesId = series.id;
      const { response } = await createVideoViaApi(request, series.id, '板橋慈惠宮');
      const videoId = await videoIdFrom(response);
      state.videoIds = [videoId];
      await generateBoardViaApi(request, videoId);
      await page.goto(`/videos/${videoId}/temple-board`);
      await page.getByRole('button', { name: '修改：廟前全景', exact: true }).click();
      return;
    }
    case '創作首頁':
      await confirmedVideo(request, state, '板橋慈惠宮', true);
      await openStudio(page, state);
      return;
    case '問卷':
      await confirmedVideo(request, state, '板橋慈惠宮', true);
      await chatAndExpectDone(request, state, '講媽祖顯靈救漁民的故事');
      await openStudio(page, state);
      await expect(page.getByRole('heading', { level: 2, name: '設定問卷' })).toBeVisible();
      return;
    default:
      throw new Error(`沒有這個位置：${where}`);
  }
});

// ── 工作區版面 ──

Then(/^面板標題是「(.+)」$/, async ({ page }, title: string) => {
  await expect(page.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible();
});

Then(/^工作區頂端顯示「(.+)」$/, async ({ page }, text: string) => {
  await expect(page.getByRole('banner').getByText(text, { exact: true })).toBeVisible();
});

Then('工作區頂端顯示這個系列的名稱', async ({ page, state }) => {
  if (!state.seriesName) throw new Error('這個場景還沒有建立系列');
  await expect(page.getByRole('banner').getByText(state.seriesName, { exact: true })).toBeVisible();
});

Then(/^快捷標籤依序是「(.+)」$/, async ({ page }, tags: string) => {
  await expect(page.getByRole('group', { name: '快捷標籤' }).getByRole('button')).toHaveText(tags.split('、'));
});

When(/^我按下快捷標籤「(.+)」$/, async ({ page }, tag: string) => {
  await page.getByRole('group', { name: '快捷標籤' }).getByRole('button', { name: tag, exact: true }).click();
});

When(/^我在「(.+)」的最後接著打「(.+)」$/, async ({ page }, label: string, text: string) => {
  const field = page.getByLabel(label, { exact: true });
  await field.press('End');
  await field.pressSequentially(text);
});

When(/^我在面板選單選擇「(.+)」$/, async ({ page }, panel: string) => {
  await page.getByLabel('面板', { exact: true }).selectOption({ label: panel });
});

Then(/^面板選單的「(.+)」不能選，說明「(.+)」$/, async ({ page }, panel: string, reason: string) => {
  await expect(page.getByRole('option', { name: `${panel}（${reason}）`, exact: true })).toBeDisabled();
});

Then(/^「([^」]+)」是空的$/, async ({ page }, label: string) => {
  await expect(page.getByLabel(label, { exact: true })).toHaveValue('');
});

// ── 對話 ──

Then(/^對話裡有我說的「(.+)」$/, async ({ page }, text: string) => {
  await expect(chatLog(page).getByRole('article', { name: '我說' }).filter({ hasText: text })).toBeVisible();
});

Then(/^對話裡有 (\d+) 則 Agent 的回覆$/, async ({ page }, count: string) => {
  await expect(chatLog(page).getByRole('article', { name: 'Agent 說' })).toHaveCount(Number(count), { timeout: 15_000 });
});

Then(/^對話裡記下 Agent 做了「(.+)」$/, async ({ page }, label: string) => {
  await expect(chatLog(page).getByRole('article', { name: 'Agent 說' }).getByText(label, { exact: true })).toBeVisible();
});

Then('對話裡沒有任何訊息', async ({ page }) => {
  await expect(chatLog(page)).toBeVisible();
  await expect(chatLog(page).getByRole('article')).toHaveCount(0);
});

Then(/^對話裡有問卷答案摘要「(.+)」$/, async ({ page }, text: string) => {
  await expect(chatLog(page).getByRole('article', { name: '我說' }).filter({ hasText: '送出問卷' }).getByText(text, { exact: true })).toBeVisible();
});

Then(/^這支影片的階段是「([^」]+)」$/, async ({ request, state }, stage: string) => {
  await expect.poll(async () => (await fetchVideoDetail(request, requireVideoId(state))).video.stage).toBe(stage);
});

Then(/^這支影片的創作輸入是「(.+)」$/, async ({ request, state }, text: string) => {
  expect((await fetchVideoDetail(request, requireVideoId(state))).video.creativeInput).toBe(text);
});

Then(/^假的 Claude 收到 (\d+) 次創作 Agent 的請求$/, async ({ request, state }, count: string) => {
  if (!state.seriesName) throw new Error('這個場景還沒有建立系列');
  const seriesName = state.seriesName;
  // 系統指令有這個場景的系列名稱（每個場景不同），只算這個場景的請求
  const mine = (await fakeClaudeRequests(request)).filter((r) => r.system.includes(AGENT_ROLE) && r.system.includes(seriesName));
  expect(mine).toHaveLength(Number(count));
});

Then(/^假的 Claude 收到的 Agent 工具是「(.+)」$/, async ({ request, state }, names: string) => {
  if (!state.seriesName) throw new Error('這個場景還沒有建立系列');
  const seriesName = state.seriesName;
  const mine = (await fakeClaudeRequests(request)).filter((r) => r.system.includes(AGENT_ROLE) && r.system.includes(seriesName));
  expect(mine.length).toBeGreaterThan(0);
  for (const sent of mine) expect(sent.tools).toEqual(names.split('、'));
});

When(/^我透過 API 對這支影片的 Agent 說話，但(.+)$/, async ({ request, state }, situation: string) => {
  switch (situation) {
    case '內容是空白':
      state.lastResponse = await request.post(`/api/videos/${requireVideoId(state)}/chat`, { data: { content: '   ' } });
      return;
    case '寺廟定裝版還沒確認':
      // 這個場景的影片只產生、還沒確認定裝版
      state.lastResponse = await request.post(`/api/videos/${requireVideoId(state)}/chat`, { data: { content: '你好' } });
      return;
    case '影片不存在':
      state.lastResponse = await request.post('/api/videos/no-such-video/chat', { data: { content: '你好' } });
      return;
    default:
      throw new Error(`沒有這個情況：${situation}`);
  }
});

// ── 問卷 ──

Then(/^問卷題目「(.+)」標示「(.+)」$/, async ({ page }, title: string, tag: string) => {
  await expect(questionRegion(page, title).getByText(tag, { exact: true })).toBeVisible();
});

When(/^我在「([^」]+)」再按一次「([^」]+)」取消選取$/, async ({ page }, group: string, option: string) => {
  await page.getByRole('group', { name: group }).getByRole('button', { name: option, exact: true }).click();
});

Then(/^「([^」]+)」的「或自己寫」是空的$/, async ({ page }, group: string) => {
  await expect(page.getByRole('group', { name: group }).getByLabel('或自己寫')).toHaveValue('');
});

When(/^我勾選「([^」]+)」的「(.+)」$/, async ({ page }, group: string, label: string) => {
  await page.getByRole('group', { name: group }).getByRole('checkbox', { name: label, exact: true }).check();
});

Then(/^「([^」]+)」的「(.+)」已勾選$/, async ({ page }, group: string, label: string) => {
  await expect(page.getByRole('group', { name: group }).getByRole('checkbox', { name: label, exact: true })).toBeChecked();
});

When('我透過 API 送出問卷，每一題都有作答', async ({ request, state }) => {
  const videoId = requireVideoId(state);
  state.lastResponse = await request.put(`/api/videos/${videoId}/questionnaire`, { data: { answers: await answerEverything(request, videoId) } });
});

When(/^我透過 API 送出問卷，「(.+)」選「(.+)」、「(.+)」選「(.+)」$/, async ({ request, state }, q1: string, a1: string, q2: string, a2: string) => {
  const response = await request.put(`/api/videos/${requireVideoId(state)}/questionnaire`, {
    data: {
      answers: [
        { questionId: questionIdOf(q1), choice: a1 },
        { questionId: questionIdOf(q2), choice: a2 },
        { questionId: 'length', choice: '30 秒' },
      ],
    },
  });
  expect(response.status()).toBe(200);
  state.lastResponse = response;
});

When(/^我透過 API 送出問卷，但(.+)$/, async ({ request, state }, situation: string) => {
  const url = `/api/videos/${requireVideoId(state)}/questionnaire`;
  const answers: Record<string, unknown[]> = {
    選項不在這一題: [{ questionId: 'tone', choice: '搞笑' }],
    同時選了選項又自己寫: [{ questionId: 'tone', choice: '溫暖', custom: '更溫暖一點' }],
    照片不是這支影片的: [{ questionId: 'photos', photoIds: ['no-such-photo'] }],
    題目不在這份問卷: [{ questionId: 'no_such_question', choice: '介紹歷史' }],
  };
  const data = answers[situation];
  if (!data) throw new Error(`沒有這個情況：${situation}`);
  state.lastResponse = await request.put(url, { data: { answers: data } });
});

Then('這個系列的問卷預設值是：', async ({ request, state }, table: DataTable) => {
  const defaults = (await fetchSeriesDefaults(request, requireSeriesId(state))) ?? {};
  const expected = Object.fromEntries(
    table.hashes().map((row) => {
      const question = findQuestion(questionIdOf(row['題目'] ?? ''));
      const answer = row['答案'] ?? '';
      return [question?.id, question?.options.includes(answer as never) ? { choice: answer } : { custom: answer }];
    }),
  );
  expect(defaults).toEqual(expected);
});

Then(/^這個系列的問卷預設值(有|沒有)「(.+)」$/, async ({ request, state }, has: string, title: string) => {
  const defaults = (await fetchSeriesDefaults(request, requireSeriesId(state))) ?? {};
  expect(Object.keys(defaults).includes(questionIdOf(title))).toBe(has === '有');
});

Then('這支影片的問卷還沒有送出', async ({ request, state }) => {
  const questionnaire = await fetchQuestionnaire(request, requireVideoId(state));
  expect(questionnaire).not.toBeNull();
  expect(questionnaire?.submittedAt).toBeNull();
});

// ── AI 輔助撰寫 ──

Then('我看到 AI 建議', async ({ page, state }) => {
  const text = suggestionRegion(page).getByRole('paragraph');
  await expect(text).toBeVisible({ timeout: 15_000 });
  state.aiSuggestion = (await text.textContent()) ?? '';
  expect(state.aiSuggestion.length).toBeGreaterThan(0);
});

When(/^我在 AI 建議按下「(.+)」$/, async ({ page }, name: string) => {
  await suggestionRegion(page).getByRole('button', { name, exact: true }).click();
});

Then('AI 建議換成新的內容', async ({ page, state }) => {
  const before = state.aiSuggestion;
  if (!before) throw new Error('還沒有看到 AI 建議');
  const text = suggestionRegion(page).getByRole('paragraph');
  await expect(text).not.toHaveText(before, { timeout: 15_000 });
  await expect(text).toBeVisible();
  state.aiSuggestion = (await text.textContent()) ?? '';
});

Then('AI 建議已關閉', async ({ page }) => {
  await expect(suggestionRegion(page)).toHaveCount(0);
});

Then(/^「([^」]+)」的內容是剛才的 AI 建議$/, async ({ page, state }, label: string) => {
  if (!state.aiSuggestion) throw new Error('還沒有看到 AI 建議');
  await expect(page.getByLabel(label, { exact: true })).toHaveValue(state.aiSuggestion);
});

Then(/^「([^」]+)」的「或自己寫」是剛才的 AI 建議$/, async ({ page, state }, group: string) => {
  if (!state.aiSuggestion) throw new Error('還沒有看到 AI 建議');
  await expect(page.getByRole('group', { name: group }).getByLabel('或自己寫')).toHaveValue(state.aiSuggestion);
});

Then(/^假的 Claude 收到一筆撰寫請求，系統指令包含「(.+)」、內容包含「(.+)」$/, async ({ request }, system: string, user: string) => {
  const found = (await fakeClaudeRequests(request)).filter((r) => r.system.includes(system) && r.user.includes(user));
  expect(found.length).toBeGreaterThan(0);
});

When(/^我透過 API 請 AI 幫我寫「(.+)」$/, async ({ request, state }, field: string) => {
  state.lastResponse = await request.post('/api/assist', { data: { field, videoId: requireVideoId(state), userInput: '媽祖救漁民' } });
  const body = (await state.lastResponse.json()) as { log?: { id: string } };
  state.assistLogId = body.log?.id;
});

When('我透過 API 採用這筆 AI 建議', async ({ request, state }) => {
  if (!state.assistLogId) throw new Error('還沒有 AI 輔助撰寫紀錄');
  const response = await request.post(`/api/assist/${state.assistLogId}/adopt`);
  expect(response.status()).toBe(200);
});

Then(/^這筆 AI 輔助撰寫紀錄標示(未採用|已採用)$/, async ({ request, state }, which: string) => {
  if (!state.assistLogId) throw new Error('還沒有 AI 輔助撰寫紀錄');
  const response = await request.get(`/api/assist/${state.assistLogId}`);
  expect(response.status()).toBe(200);
  const { log } = (await response.json()) as { log: { adopted: boolean } };
  expect(log.adopted).toBe(which === '已採用');
});

When(/^我透過 API 請 AI 幫我寫，但(.+)$/, async ({ request, state }, situation: string) => {
  const videoId = requireVideoId(state);
  const payloads: Record<string, Record<string, unknown>> = {
    欄位不在清單: { field: 'plan.shot', videoId },
    影片不存在: { field: 'creative.input', videoId: 'no-such-video' },
    系列不存在: { field: 'series.visualStyle', seriesId: 'no-such-series' },
    影片欄位沒有指定影片: { field: 'creative.input' },
    '內容超過 2000 字': { field: 'creative.input', videoId, userInput: '字'.repeat(2001) },
  };
  const data = payloads[situation];
  if (!data) throw new Error(`沒有這個情況：${situation}`);
  state.lastResponse = await request.post('/api/assist', { data });
});
