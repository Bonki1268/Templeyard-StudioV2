import { readFileSync } from 'node:fs';
import { expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';
import { chatEventSchema, createSseParser, framesResponseSchema, planResponseSchema, planVersionResponseSchema, shotDetailSchema } from '@templeyard/shared';
import { Given, Then, When } from './fixtures';
import { consentViaApi, photoFixture } from './support/api';

// 第 10 階段：分鏡細修、中間關鍵畫格、限定範圍修改、只針對這一格的對話

type State = { videoIds?: string[]; lastResponse?: APIResponse };

const FAKE_COMFY_URL = 'http://127.0.0.1:3401';

function requireVideoId(state: State): string {
  const id = state.videoIds?.at(-1);
  if (!id) throw new Error('這個場景還沒有建立影片');
  return id;
}

async function currentPlan(request: APIRequestContext, videoId: string) {
  const { plan } = planResponseSchema.parse(await (await request.get(`/api/videos/${videoId}/plan`)).json());
  if (!plan) throw new Error('這支影片還沒有分鏡方案');
  return plan;
}

async function shotKeyOf(request: APIRequestContext, videoId: string, seq: number | string): Promise<string> {
  const key = (await currentPlan(request, videoId)).shots[Number(seq) - 1]?.shotKey;
  if (!key) throw new Error(`方案沒有第 ${seq} 格`);
  return key;
}

async function fetchDetail(request: APIRequestContext, videoId: string, shotKey: string) {
  const response = await request.get(`/api/videos/${videoId}/shots/${shotKey}`);
  expect(response.status()).toBe(200);
  return shotDetailSchema.parse(await response.json());
}

async function waitFramesDone(request: APIRequestContext, videoId: string) {
  await expect
    .poll(async () => framesResponseSchema.parse(await (await request.get(`/api/videos/${videoId}/frames`)).json()).generating, { timeout: 20_000 })
    .toBe(false);
}

function preview(page: Page, name: string) {
  return page.getByRole('region', { name: '預覽', exact: true }).getByRole('figure', { name, exact: true });
}

function versions(page: Page) {
  return page.getByRole('group', { name: '版本', exact: true }).getByRole('listitem');
}

// ── 準備 ──

Given(/^我打開這支影片第 (\d+) 格的細修頁$/, async ({ page, request, state }, seq: string) => {
  const videoId = requireVideoId(state);
  await page.goto(`/videos/${videoId}/shots/${await shotKeyOf(request, videoId, seq)}`);
  await expect(page.getByRole('heading', { level: 1, name: `分鏡細修・第 ${seq} 格` })).toBeVisible();
});

Given(/^我透過 API 重生第 (\d+) 格的首格$/, async ({ request, state }, seq: string) => {
  const videoId = requireVideoId(state);
  const key = await shotKeyOf(request, videoId, seq);
  const response = await request.post(`/api/videos/${videoId}/shots/${key}/regenerate`, { data: { kind: 'first', consentToken: await consentViaApi(request, videoId, 1) } });
  expect(response.status()).toBe(202);
  await waitFramesDone(request, videoId);
});

Given(/^我透過 API 把第 (\d+) 格的中間關鍵畫格設成「(.+)」$/, async ({ request, state }, seq: string, times: string) => {
  const videoId = requireVideoId(state);
  const key = await shotKeyOf(request, videoId, seq);
  const response = await request.patch(`/api/videos/${videoId}/shots/${key}`, { data: { keyframesEnabled: true, keyframeTimes: times.split('、').map(Number) } });
  expect(response.status()).toBe(200);
});

When(/^我透過 API 產生第 (\d+) 格的關鍵畫格$/, async ({ request, state }, seq: string) => {
  const videoId = requireVideoId(state);
  const key = await shotKeyOf(request, videoId, seq);
  const detail = await fetchDetail(request, videoId, key);
  const units = detail.shot.keyframeTimes.length + (detail.last ? 0 : 1);
  const response = await request.post(`/api/videos/${videoId}/shots/${key}/keyframes/generate`, { data: { consentToken: await consentViaApi(request, videoId, units) } });
  expect(response.status()).toBe(202);
  await waitFramesDone(request, videoId);
});

Given(/^我已經透過 API 對第 (\d+) 格的 Agent 說「(.+)」$/, async ({ request, state }, seq: string, content: string) => {
  const videoId = requireVideoId(state);
  const key = await shotKeyOf(request, videoId, seq);
  const response = await request.post(`/api/videos/${videoId}/shots/${key}/chat`, { data: { content } });
  expect(response.status()).toBe(200);
  const events = createSseParser()
    .push(await response.text())
    .map((m) => chatEventSchema.parse(JSON.parse(m.data)));
  expect(events.at(-1)?.type).toBe('done');
});

// ── 細修頁 ──

Then(/^網址是這支影片第 (\d+) 格的細修頁$/, async ({ page, request, state }, seq: string) => {
  const videoId = requireVideoId(state);
  const key = await shotKeyOf(request, videoId, seq);
  await expect(page).toHaveURL(new RegExp(`/videos/${videoId}/shots/${key}(\\?.*)?$`));
});

Then(/^分鏡切換有 (\d+) 格$/, async ({ page }, count: string) => {
  await expect(page.getByRole('navigation', { name: '分鏡切換' }).getByRole('link')).toHaveCount(Number(count));
});

When(/^我在分鏡切換按下「(.+)」$/, async ({ page }, name: string) => {
  await page.getByRole('navigation', { name: '分鏡切換' }).getByRole('link', { name, exact: true }).click();
});

Then(/^細修頁的預覽有「(.+)」$/, async ({ page }, name: string) => {
  await expect(preview(page, name).getByRole('img')).toBeVisible({ timeout: 20_000 });
});

Then(/^細修頁的(首格|末格)標示「(.+)」$/, async ({ page }, name: string, tag: string) => {
  await expect(preview(page, name).getByText(tag, { exact: true })).toBeVisible({ timeout: 20_000 });
});

Then(/^細修頁的首格是第 (\d+) 張$/, async ({ page }, nth: string) => {
  await expect(preview(page, '首格').getByText(`首格第 ${nth} 張`, { exact: true })).toBeVisible();
});

Then(/^單格時間軸顯示「(.+)」$/, async ({ page }, text: string) => {
  await expect(page.getByRole('region', { name: '單格時間軸', exact: true }).getByText(text, { exact: true })).toBeVisible();
});

Then(/^細修頁的設定依序是「(.+)」$/, async ({ page }, names: string) => {
  // 設定的折疊區塊都是用 aria-label 命名的 group；區塊裡面的欄位群組（出場角色、圈選範圍）用 legend 命名，
  // 沒有 aria-label，不算進來。多出或少了區塊、順序不同都會失敗
  const groups = await page.getByRole('region', { name: '設定', exact: true }).getByRole('group').all();
  const titles: string[] = [];
  for (const group of groups) {
    const label = await group.getAttribute('aria-label');
    if (label) titles.push(label);
  }
  expect(titles).toEqual(names.split('、'));
});

Then(/^細修頁顯示「(.+)」$/, async ({ page }, text: string) => {
  await expect(page.getByText(text, { exact: true })).toBeVisible();
});

When(/^我在「([^」]+)」選「(.+)」$/, async ({ page }, label: string, option: string) => {
  await page.getByLabel(label, { exact: true }).selectOption({ label: option });
});

When(/^我勾選出場角色「(.+)」$/, async ({ page }, name: string) => {
  await page.getByRole('group', { name: '出場角色', exact: true }).getByRole('checkbox', { name, exact: true }).check();
});

When(/^我勾選「([^」]+)」$/, async ({ page }, label: string) => {
  await page.getByLabel(label, { exact: true }).check();
});

When(/^我上傳自己的圖「(.+)」作為(首格|末格)$/, async ({ page }, file: string, kind: string) => {
  await page.getByLabel(`上傳自己的${kind}`, { exact: true }).setInputFiles(photoFixture(file));
});

Then(/^細修頁的「(.+)」標示「(.+)」$/, async ({ page }, name: string, tag: string) => {
  await expect(preview(page, name).getByText(tag, { exact: true })).toBeVisible({ timeout: 20_000 });
});

Then(/^「(.+)」有內容$/, async ({ page }, label: string) => {
  await expect(page.getByLabel(label, { exact: true })).toHaveValue(/\S/);
});

Then(/^版本列出 (\d+) 張首格$/, async ({ page }, count: string) => {
  await expect(versions(page).filter({ hasText: /^首格第 \d+ 張/ })).toHaveCount(Number(count), { timeout: 20_000 });
});

Then(/^版本的「(.+)」標示「(.+)」$/, async ({ page }, name: string, tag: string) => {
  await expect(versions(page).filter({ hasText: name }).getByText(tag, { exact: true })).toBeVisible({ timeout: 20_000 });
});

When(/^我把圈選範圍設成左 (\d+)%、上 (\d+)%、寬 (\d+)%、高 (\d+)%$/, async ({ page }, left: string, top: string, width: string, height: string) => {
  const group = page.getByRole('group', { name: '圈選範圍', exact: true });
  // (\d+) 會被轉成數字，fill 只收字串
  await group.getByLabel('左（%）', { exact: true }).fill(String(left));
  await group.getByLabel('上（%）', { exact: true }).fill(String(top));
  await group.getByLabel('寬（%）', { exact: true }).fill(String(width));
  await group.getByLabel('高（%）', { exact: true }).fill(String(height));
});

Then(/^精緻圖的第 (\d+) 格以警告色外框標示$/, async ({ page }, seq: string) => {
  const card = page.getByRole('list', { name: '精緻圖' }).getByRole('article', { name: `第 ${seq} 格`, exact: true });
  const colors = await card.evaluate((el) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--color-warning-surface)';
    document.body.appendChild(probe);
    const warning = getComputedStyle(probe).color;
    probe.remove();
    return { border: getComputedStyle(el).borderTopColor, warning, text: getComputedStyle(document.body).color };
  });
  expect(colors.warning).not.toBe(colors.text);
  expect(colors.border).toBe(colors.warning);
});

// ── API ──

Then(/^這支影片的方案是第 (\d+) 版，第 (\d+) 格的畫面內容是「(.+)」$/, async ({ request, state }, version: string, seq: string, text: string) => {
  const plan = await currentPlan(request, requireVideoId(state));
  expect(plan.version).toBe(Number(version));
  expect(plan.shots[Number(seq) - 1]?.description).toBe(text);
});

Then(/^這支影片的方案第 (\d+) 格是(遠景|中景|特寫)、(平視|仰角|俯角)，出場角色有「(.+)」$/, async ({ request, state }, seq: string, size: string, angle: string, name: string) => {
  const shot = (await currentPlan(request, requireVideoId(state))).shots[Number(seq) - 1];
  expect(shot).toMatchObject({ shotSize: size, cameraAngle: angle });
  expect(shot?.characters).toContain(name);
});

Then(/^這支影片的方案第 (\d+) 格是(遠景|中景|特寫)，其他格沒有改$/, async ({ request, state }, seq: string, size: string) => {
  const videoId = requireVideoId(state);
  const plan = await currentPlan(request, videoId);
  expect(plan.source).toBe('chat_edit');
  const previous = planVersionResponseSchema.parse(await (await request.get(`/api/videos/${videoId}/plan/versions/${plan.version - 1}`)).json()).plan;
  plan.shots.forEach((shot, index) => {
    if (index === Number(seq) - 1) expect(shot.shotSize).toBe(size);
    else expect(shot).toEqual(previous.shots[index]);
  });
});

Then(/^第 (\d+) 格的(首格|末格)是去識別後的圖，原圖沒有送到後端$/, async ({ request, state }, seq: string, kind: string) => {
  const videoId = requireVideoId(state);
  const frameKind = kind === '首格' ? 'first' : 'last';
  const pick = (detail: Awaited<ReturnType<typeof fetchDetail>>) => (kind === '首格' ? detail.first : detail.last);
  const uploadedOf = (detail: Awaited<ReturnType<typeof fetchDetail>>) => detail.versions.find((v) => v.userUploaded && v.kind === frameKind);
  // 上傳的那一張成為這一格目前的首格／末格
  await expect
    .poll(async () => {
      const detail = await fetchDetail(request, videoId, await shotKeyOf(request, videoId, seq));
      return Boolean(uploadedOf(detail)) && uploadedOf(detail)?.id === pick(detail)?.id;
    }, { timeout: 20_000 })
    .toBe(true);
  const detail = await fetchDetail(request, videoId, await shotKeyOf(request, videoId, seq));
  const uploaded = uploadedOf(detail);
  const bytes = await (await request.get(`/api/assets/${uploaded?.assetId}`)).body();
  expect(bytes.equals(readFileSync(photoFixture('廟前全景.png')))).toBe(false);
});

Then(/^假的雲端最近一次收到的第 (\d+) 格生成指令是「(.+)」$/, async ({ request, state }, seq: string, prompt: string) => {
  // 這一格最近一次的生成指令就是自訂指令，而且假的雲端收到的呼叫裡有這段指令
  const videoId = requireVideoId(state);
  await expect.poll(async () => (await fetchDetail(request, videoId, await shotKeyOf(request, videoId, seq))).lastPrompt, { timeout: 20_000 }).toBe(prompt);
  const { calls } = (await (await request.get(`${FAKE_COMFY_URL}/__calls`)).json()) as { calls: { tool?: string; args?: Record<string, unknown> }[] };
  const sent = calls.filter((c) => c.tool === 'partner_generate' && c.args?.confirm === true && c.args?.prompt === prompt);
  expect(sent.length).toBeGreaterThan(0);
});

When(/^我透過 API 細修第 (\d+) 格，但(.+)$/, async ({ request, state }, seq: string, situation: string) => {
  const videoId = requireVideoId(state);
  const key = await shotKeyOf(request, videoId, seq);
  switch (situation) {
    case '上傳的圖不是 PNG 或 JPEG':
      state.lastResponse = await request.post(`/api/videos/${videoId}/shots/${key}/frames/upload`, { data: { kind: 'first', mime: 'image/gif', dataBase64: 'R0lGOD' } });
      return;
    case '格子不存在':
      state.lastResponse = await request.patch(`/api/videos/${videoId}/shots/no-such-shot`, { data: { description: 'x' } });
      return;
    case '選回的圖不是這一格的': {
      const other = await fetchDetail(request, videoId, await shotKeyOf(request, videoId, 2));
      state.lastResponse = await request.post(`/api/videos/${videoId}/shots/${key}/frames/${other.first?.id ?? 'none'}/select`);
      return;
    }
    default:
      throw new Error(`沒有這個情況：${situation}`);
  }
});

When(/^我透過 API 修改第 (\d+) 格首格的一處，但(.+)$/, async ({ request, state }, seq: string, situation: string) => {
  const videoId = requireVideoId(state);
  const key = await shotKeyOf(request, videoId, seq);
  const frameId = (await fetchDetail(request, videoId, key)).first?.id ?? 'none';
  const url = `/api/videos/${videoId}/shots/${key}/frames/${frameId}/edit`;
  const box = { x: 0.1, y: 0.1, width: 0.3, height: 0.3 };
  const payloads: Record<string, Record<string, unknown>> = {
    沒有指令: { box, instruction: '  ' },
    範圍超出畫面: { box: { x: 0.9, y: 0, width: 0.3, height: 0.3 }, instruction: '改一下' },
    範圍是空的: { box: { x: 0.1, y: 0.1, width: 0, height: 0.3 }, instruction: '改一下' },
    沒有同意憑證: { box, instruction: '改一下' },
  };
  const data = payloads[situation];
  if (!data) throw new Error(`沒有這個情況：${situation}`);
  state.lastResponse = await request.post(url, { data });
});

Then(/^對話裡沒有我說的「(.+)」$/, async ({ page }, text: string) => {
  await expect(page.getByRole('region', { name: '對話' })).toBeVisible();
  await expect(page.getByRole('region', { name: '對話' }).getByRole('article', { name: '我說' }).filter({ hasText: text })).toHaveCount(0);
});

Then(/^生成中以狀態訊息宣告，內容是「(.+)」與「(.+)」$/, async ({ page }, a: string, b: string) => {
  const status = page.getByRole('status').filter({ hasText: a }).filter({ hasText: b });
  await expect(status).toBeVisible();
});

// ── 第 11 階段稽核補充：關鍵畫格的失效（秒數、參考素材） ──

When(/^我透過 API 把第 (\d+) 格的秒數改成 (\d+)$/, async ({ request, state }, seq: string, sec: string) => {
  const videoId = requireVideoId(state);
  const response = await request.patch(`/api/videos/${videoId}/shots/${await shotKeyOf(request, videoId, seq)}`, { data: { durationSec: Number(sec) } });
  expect(response.status()).toBe(200);
});

When(/^我透過 API 把第 (\d+) 格的出場角色清空$/, async ({ request, state }, seq: string) => {
  const videoId = requireVideoId(state);
  const response = await request.patch(`/api/videos/${videoId}/shots/${await shotKeyOf(request, videoId, seq)}`, { data: { characters: [] } });
  expect(response.status()).toBe(200);
});
