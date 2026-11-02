import { expect, type APIResponse } from '@playwright/test';
import { Given, Then, When } from './fixtures';

// 費用控制（F19）：只透過 API，不會呼叫任何外部服務

type State = { videoIds?: string[]; lastResponse?: APIResponse };

function requireVideoId(state: State): string {
  const id = state.videoIds?.at(-1);
  if (!id) throw new Error('這個場景還沒有建立影片');
  return id;
}

/** 「124 點」→ 124；「不設定」→ null */
function parseCredits(text: string): number | null {
  if (text === '不設定') return null;
  const match = /^(\d+) 點$/.exec(text);
  if (!match) throw new Error(`看不懂這個點數：${text}`);
  return Number(match[1]);
}

const UNIT_WORDS = new Set(['秒', '張']);

function estimateBody(model: string, units: string, unit: string) {
  if (!UNIT_WORDS.has(unit)) throw new Error(`看不懂這個單位：${unit}`);
  return { items: [{ model, units: Number(units) }] };
}

Given(/^單筆同意門檻是「(.+)」$/, async ({ request }, value: string) => {
  const response = await request.patch('/api/settings', { data: { consentThresholdCredits: parseCredits(value) } });
  expect(response.status()).toBe(200);
});

Given(/^這支影片的費用上限是「(.+)」$/, async ({ request, state }, value: string) => {
  const response = await request.patch(`/api/videos/${requireVideoId(state)}`, { data: { costLimit: parseCredits(value) } });
  expect(response.status()).toBe(200);
});

When(/^我透過 API 預估「(.+)」生成 (\d+(?:\.\d+)?) ?(秒|張)的費用$/, async ({ request, state }, model: string, units: string, unit: string) => {
  state.lastResponse = await request.post(`/api/videos/${requireVideoId(state)}/cost-estimate`, {
    data: estimateBody(model, units, unit),
  });
  expect(state.lastResponse.status()).toBe(200);
});

When(/^我透過 API 同意「(.+)」生成 (\d+) 秒的費用$/, async ({ request, state }, model: string, units: string) => {
  state.lastResponse = await request.post(`/api/videos/${requireVideoId(state)}/consents`, {
    data: estimateBody(model, units, '秒'),
  });
});

async function body(state: State): Promise<Record<string, unknown>> {
  if (!state.lastResponse) throw new Error('還沒有送出請求');
  return (await state.lastResponse.json()) as Record<string, unknown>;
}

function creditsText(value: unknown): string {
  return typeof value === 'number' ? `${value} 點` : '[待實測]';
}

Then(/^預估費用是「(.+)」$/, async ({ state }, expected: string) => {
  const { estimate } = (await body(state)) as { estimate: { credits: number | null } };
  expect(creditsText(estimate.credits)).toBe(expected);
});

Then(/^這次生成(不需要|需要)再次同意$/, async ({ state }, answer: string) => {
  const { consent } = (await body(state)) as { consent: { required: boolean } };
  expect(consent.required).toBe(answer === '需要');
});

Then(/^需要同意的原因是「(.+)」$/, async ({ state }, reason: string) => {
  const { consent } = (await body(state)) as { consent: { reasons: { message: string }[] } };
  expect(consent.reasons.map((r) => r.message)).toEqual(reason === '無' ? [] : [reason]);
});

Then(/^回應裡有同意憑證，預估費用是「(.+)」$/, async ({ state }, expected: string) => {
  const data = (await body(state)) as { consentToken?: unknown; expiresAt?: unknown; estimate: { credits: number | null } };
  expect(typeof data.consentToken).toBe('string');
  expect(String(data.consentToken).length).toBeGreaterThanOrEqual(16);
  expect(new Date(String(data.expiresAt)).getTime()).toBeGreaterThan(Date.now());
  expect(creditsText(data.estimate.credits)).toBe(expected);
});

When('我透過 API 查看這支影片的費用', async ({ request, state }) => {
  state.lastResponse = await request.get(`/api/videos/${requireVideoId(state)}/cost`);
  expect(state.lastResponse.status()).toBe(200);
});

Then(/^已用 (\d+) 點、預留 (\d+) 點、上限 (\d+) 點$/, async ({ state }, spent: string, reserved: string, limit: string) => {
  const { budget } = (await body(state)) as { budget: { spent: number; reserved: number; limit: number | null } };
  expect({ spent: budget.spent, reserved: budget.reserved, limit: budget.limit }).toEqual({
    spent: Number(spent),
    reserved: Number(reserved),
    limit: Number(limit),
  });
});

When(/^我透過 API 設定費用，但(.+)$/, async ({ request, state }, situation: string) => {
  const videoId = requireVideoId(state);
  switch (situation) {
    case '影片上限是負數':
      state.lastResponse = await request.patch(`/api/videos/${videoId}`, { data: { costLimit: -1 } });
      return;
    case '同意門檻是小數':
      state.lastResponse = await request.patch('/api/settings', { data: { consentThresholdCredits: 1.5 } });
      return;
    case '預估的模型不在清單':
      state.lastResponse = await request.post(`/api/videos/${videoId}/cost-estimate`, { data: { items: [{ model: 'no-such', units: 1 }] } });
      return;
    default:
      throw new Error(`沒有定義這種錯誤資料：${situation}`);
  }
});

