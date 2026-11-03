import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { assDialogues, clipsResponseSchema, planResponseSchema, shotDetailSchema } from '@templeyard/shared';
import { Then, When } from './fixtures';

// 第 11 階段：分鏡影片、偏差比對、成品合成、生成設定

type State = { videoIds?: string[]; lastResponse?: APIResponse };

const FAKE_COMFY_URL = 'http://127.0.0.1:3401';
const MUSIC_TEMPLATE = 'audio_ace_step1_5_xl_turbo';

type FakeCall = { tool?: string; args?: Record<string, unknown> };
type FakeUpload = { ref: string; sha256: string; filename: string };

function requireVideoId(state: State): string {
  const id = state.videoIds?.at(-1);
  if (!id) throw new Error('這個場景還沒有建立影片');
  return id;
}

async function fakeComfy(request: APIRequestContext): Promise<{ calls: FakeCall[]; uploads: FakeUpload[] }> {
  return (await (await request.get(`${FAKE_COMFY_URL}/__calls`)).json()) as { calls: FakeCall[]; uploads: FakeUpload[] };
}

/** 送出（帶 confirm: true）的影片呼叫：partner_generate 的 type 是 video，或範本名稱有 t2v */
function videoCalls(calls: FakeCall[]): FakeCall[] {
  return calls.filter((c) => c.args?.confirm === true && (c.args?.type === 'video' || /t2v|i2v/.test(String(c.args?.name ?? ''))));
}

async function currentPlan(request: APIRequestContext, videoId: string) {
  const { plan } = planResponseSchema.parse(await (await request.get(`/api/videos/${videoId}/plan`)).json());
  if (!plan) throw new Error('這支影片還沒有分鏡方案');
  return plan;
}

async function fetchClips(request: APIRequestContext, videoId: string) {
  const response = await request.get(`/api/videos/${videoId}/clips`);
  expect(response.status()).toBe(200);
  return clipsResponseSchema.parse(await response.json());
}

async function requireFinal(request: APIRequestContext, videoId: string) {
  const { final } = await fetchClips(request, videoId);
  if (!final) throw new Error('這支影片還沒有成品');
  return final;
}

async function fetchDetail(request: APIRequestContext, videoId: string, seq: number | string) {
  const key = (await currentPlan(request, videoId)).shots[Number(seq) - 1]?.shotKey;
  if (!key) throw new Error(`方案沒有第 ${seq} 格`);
  const response = await request.get(`/api/videos/${videoId}/shots/${key}`);
  expect(response.status()).toBe(200);
  return shotDetailSchema.parse(await response.json());
}

/** 下載成品並用本機 ffprobe 讀規格 */
async function probeFinal(request: APIRequestContext, videoId: string) {
  const final = await requireFinal(request, videoId);
  const bytes = await (await request.get(`/api/assets/${final.assetId}`)).body();
  const dir = mkdtempSync(path.join(tmpdir(), 'final-probe-'));
  try {
    const file = path.join(dir, 'final.mp4');
    writeFileSync(file, bytes);
    const out = execFileSync(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' });
    return JSON.parse(out) as { streams: { codec_type: string; width?: number; height?: number; r_frame_rate?: string }[]; format: { duration: string } };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── 成品面板 ──

Then('成品播放器可以播放', async ({ page, request }) => {
  const player = page.getByLabel('成品影片', { exact: true });
  await expect(player).toBeVisible({ timeout: 20_000 });
  const src = await player.getAttribute('src');
  expect(src).toBeTruthy();
  const response = await request.get(src ?? '');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('video/mp4');
});

Then(/^成品顯示「(.+)」$/, async ({ page }, text: string) => {
  await expect(page.getByText(text, { exact: true })).toBeVisible({ timeout: 20_000 });
});

// ── 成品規格（06 完成條件） ──

Then('成品檔案的畫面是 1920×1080、24 fps，有聲音', async ({ request, state }) => {
  const probe = await probeFinal(request, requireVideoId(state));
  const video = probe.streams.find((s) => s.codec_type === 'video');
  expect(video).toMatchObject({ width: 1920, height: 1080, r_frame_rate: '24/1' });
  expect(probe.streams.some((s) => s.codec_type === 'audio')).toBe(true);
});

Then('成品檔案的長度等於分鏡方案各格秒數的總和', async ({ request, state }) => {
  const videoId = requireVideoId(state);
  const total = (await currentPlan(request, videoId)).shots.reduce((sum, shot) => sum + shot.durationSec, 0);
  const probe = await probeFinal(request, videoId);
  expect(Math.abs(Number(probe.format.duration) - total)).toBeLessThan(0.2);
  expect((await requireFinal(request, videoId)).durationSec).toBe(total);
});

Then('成品的字幕依序逐字等於分鏡方案各格的字幕欄', async ({ request, state }) => {
  const videoId = requireVideoId(state);
  const expected = (await currentPlan(request, videoId)).shots.map((shot) => shot.subtitle).filter((text) => text.trim() !== '');
  expect(expected.length).toBeGreaterThan(0);
  const final = await requireFinal(request, videoId);
  expect(final.subtitles).toEqual(expected);
  // 燒錄用的字幕檔內容也一樣
  if (!final.subtitleAssetId) throw new Error('成品沒有字幕檔');
  const ass = await (await request.get(`/api/assets/${final.subtitleAssetId}`)).text();
  expect(assDialogues(ass)).toEqual(expected);
});

// ── 送給雲端的影片呼叫 ──

Then(/^第 (\d+) 格影片的首格是第 (\d+) 格確認的精緻圖$/, async ({ request, state }, seq: string, same: string) => {
  expect(String(same)).toBe(String(seq));
  const detail = await fetchDetail(request, requireVideoId(state), seq);
  const first = detail.first?.assetId;
  if (!first) throw new Error(`第 ${seq} 格沒有首格`);
  const { calls, uploads } = await fakeComfy(request);
  const fileOf = new Map(uploads.map((u) => [u.ref, u.filename]));
  // 首格是這一格確認的那一張（檔名是資產編號，每支影片每一格都不同）
  const sent = videoCalls(calls).filter((c) => fileOf.get(String(c.args?.fake_first_frame)) === `${first}.png`);
  expect(sent.length).toBeGreaterThan(0);
  expect(JSON.stringify(sent[0]?.args)).toContain(`分鏡 ${seq}，長度`);
});

Then(/^第 (\d+) 格影片的參考圖有第 (\d+) 秒的關鍵畫格，最後一個畫面是第 (\d+) 格的末格$/, async ({ request, state }, seq: string, sec: string, same: string) => {
  expect(String(same)).toBe(String(seq));
  const detail = await fetchDetail(request, requireVideoId(state), seq);
  const keyframe = detail.keyframes.find((k) => k.atSec === Number(sec))?.assetId;
  const last = detail.last?.assetId;
  if (!keyframe || !last) throw new Error('找不到關鍵畫格或末格');
  const { calls, uploads } = await fakeComfy(request);
  const fileOf = new Map(uploads.map((u) => [u.ref, u.filename]));
  const sent = videoCalls(calls).filter((c) => fileOf.get(String(c.args?.fake_last_frame)) === `${last}.png`);
  expect(sent.length).toBe(1);
  const references = (sent[0]?.args?.fake_reference_images as unknown[] | undefined) ?? [];
  expect(references.map((ref) => fileOf.get(String(ref)))).toContain(`${keyframe}.png`);
});

Then('假的雲端收到一筆背景音樂的生成', async ({ request, state }) => {
  const total = (await currentPlan(request, requireVideoId(state))).shots.reduce((sum, shot) => sum + shot.durationSec, 0);
  const { calls } = await fakeComfy(request);
  const music = calls.filter((c) => c.args?.confirm === true && c.args?.name === MUSIC_TEMPLATE);
  const overrides = music.map((c) => (c.args?.input_overrides as Record<string, Record<string, unknown>> | undefined)?.['94']);
  // 長度等於成品長度、只有配樂沒有人聲
  expect(overrides.some((o) => o?.duration === total && o?.lyrics === '[Instrumental]')).toBe(true);
});

// ── 偏差比對 ──

Then(/^細修頁顯示第 (\d+) 秒關鍵畫格與影片的相似度$/, async ({ page }, sec: string) => {
  await expect(page.getByText(new RegExp(`^第 ${sec} 秒關鍵畫格與影片的相似度：\\d{1,3}%$`))).toBeVisible({ timeout: 20_000 });
});

// ── 失效 ──

Then(/^第 (\d+) 格的影片(沒有)?標示需重新確認$/, async ({ request, state }, seq: string, not: string | undefined) => {
  const videoId = requireVideoId(state);
  await expect
    .poll(async () => (await fetchClips(request, videoId)).shots[Number(seq) - 1]?.clip?.needsReconfirm, { timeout: 20_000 })
    .toBe(not !== '沒有');
});

Then('成品標示需重新確認', async ({ request, state }) => {
  const videoId = requireVideoId(state);
  await expect.poll(async () => (await fetchClips(request, videoId)).final?.needsReconfirm, { timeout: 20_000 }).toBe(true);
});

// ── 生成設定 ──

When(/^我取消勾選「(.+)」$/, async ({ page }, label: string) => {
  await page.getByLabel(label, { exact: true }).uncheck();
});

When(/^我透過 API 把第 (\d+) 格的候選圖張數設成 (\d+)$/, async ({ request, state }, seq: string, count: string) => {
  const videoId = requireVideoId(state);
  const key = (await currentPlan(request, videoId)).shots[Number(seq) - 1]?.shotKey;
  state.lastResponse = await request.patch(`/api/videos/${videoId}/shots/${key}`, { data: { candidateCount: Number(count) } });
});
