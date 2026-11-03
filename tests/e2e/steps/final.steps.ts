import { expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';
import {
  characterListResponseSchema,
  clipsResponseSchema,
  formatClock,
  framesResponseSchema,
  planResponseSchema,
  questionnaireResponseSchema,
  videoDetailResponseSchema,
} from '@templeyard/shared';
import { Then, When } from './fixtures';
import { fakeClaudeRequests } from './support/api';

// 第 12 階段：成品面板、對話修改成品、下載、複製影片

type State = {
  seriesId?: string;
  videoIds?: string[];
  lastResponse?: APIResponse;
  finalId?: string | null;
  clipIds?: (string | null)[];
  /** 複製出來的新影片 */
  copiedVideoId?: string;
  downloaded?: { filename: string; bytes: Buffer };
};

function requireVideoId(state: State): string {
  const id = state.videoIds?.at(-1);
  if (!id) throw new Error('這個場景還沒有建立影片');
  return id;
}

function requireCopy(state: State): string {
  if (!state.copiedVideoId) throw new Error('還沒有複製影片');
  return state.copiedVideoId;
}

function finalPanel(page: Page) {
  return page.getByRole('region', { name: '成品', exact: true });
}

async function currentPlan(request: APIRequestContext, videoId: string) {
  return planResponseSchema.parse(await (await request.get(`/api/videos/${videoId}/plan`)).json()).plan;
}

async function fetchClips(request: APIRequestContext, videoId: string) {
  const response = await request.get(`/api/videos/${videoId}/clips`);
  expect(response.status()).toBe(200);
  return clipsResponseSchema.parse(await response.json());
}

async function fetchDetail(request: APIRequestContext, videoId: string) {
  const response = await request.get(`/api/videos/${videoId}`);
  expect(response.status()).toBe(200);
  return videoDetailResponseSchema.parse(await response.json());
}

// ── 成品面板 ──

Then(/^成品資訊列出圖片模型「(.+)」與影片模型「(.+)」$/, async ({ page }, image: string, video: string) => {
  const panel = finalPanel(page);
  await expect(panel.getByRole('term').filter({ hasText: /^圖片模型$/ })).toBeVisible({ timeout: 20_000 });
  await expect(panel.getByRole('definition').filter({ hasText: new RegExp(`^${image}$`) })).toBeVisible();
  await expect(panel.getByRole('term').filter({ hasText: /^影片模型$/ })).toBeVisible();
  await expect(panel.getByRole('definition').filter({ hasText: new RegExp(`^${video}$`) })).toBeVisible();
});

Then(/^各格縮圖有 (\d+) 格，寬度依秒數比例$/, async ({ page, request, state }, count: string) => {
  const items = finalPanel(page).getByRole('list', { name: '各格縮圖' }).getByRole('listitem');
  await expect(items).toHaveCount(Number(count), { timeout: 20_000 });
  const plan = await currentPlan(request, requireVideoId(state));
  const durations = plan?.shots.map((shot) => shot.durationSec) ?? [];
  const total = durations.reduce((sum, d) => sum + d, 0);
  const widths: number[] = [];
  for (let index = 0; index < Number(count); index += 1) widths.push((await items.nth(index).boundingBox())?.width ?? 0);
  const sum = widths.reduce((a, b) => a + b, 0);
  widths.forEach((width, index) => expect(Math.abs(width / sum - (durations[index] ?? 0) / total)).toBeLessThan(0.03));
});

When(/^我在各格縮圖按下「(.+)」$/, async ({ page }, name: string) => {
  await finalPanel(page).getByRole('list', { name: '各格縮圖' }).getByRole('button', { name, exact: true }).click();
});

Then(/^播放器跳到第 (\d+) 格的開始時間$/, async ({ page, request, state }, seq: string) => {
  const shot = (await currentPlan(request, requireVideoId(state)))?.shots[Number(seq) - 1];
  if (!shot) throw new Error(`方案沒有第 ${seq} 格`);
  await expect(finalPanel(page).getByText(`從第 ${seq} 格（${formatClock(shot.startSec)}）開始播放`, { exact: true })).toBeVisible();
});

Then(/^成品面板列出「(.+)」$/, async ({ page }, text: string) => {
  await expect(finalPanel(page).getByText(text, { exact: true })).toBeVisible({ timeout: 20_000 });
});

Then(/^成品面板標示「(.+)」$/, async ({ page }, tag: string) => {
  await expect(finalPanel(page).getByText(tag, { exact: true })).toBeVisible({ timeout: 20_000 });
});

// ── 下載 ──

When('我按下「確認並下載」並取得下載的檔案', async ({ page, state }) => {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '確認並下載', exact: true }).click()]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  state.downloaded = { filename: download.suggestedFilename(), bytes: Buffer.concat(chunks) };
});

Then('下載的檔案是 MP4', async ({ state }) => {
  if (!state.downloaded) throw new Error('沒有下載檔案');
  expect(state.downloaded.filename).toMatch(/\.mp4$/);
  // MP4 的第 5～8 個位元組是 ftyp
  expect(state.downloaded.bytes.subarray(4, 8).toString('latin1')).toBe('ftyp');
});

// ── 對話修改成品 ──

Then('成品換成新的一版，不用重新確認', async ({ request, state }) => {
  const videoId = requireVideoId(state);
  await expect.poll(async () => (await fetchClips(request, videoId)).final?.id, { timeout: 40_000 }).not.toBe(state.finalId);
  expect((await fetchClips(request, videoId)).final?.needsReconfirm).toBe(false);
});

Then(/^這次只重新生成第 (\d+) 格的影片，指令帶入「(.+)」$/, async ({ request, state }, seq: string, instruction: string) => {
  const { shots } = await fetchClips(request, requireVideoId(state));
  shots.forEach((shot, index) => {
    if (index === Number(seq) - 1) expect(shot.clip?.id).not.toBe(state.clipIds?.[index]);
    else expect(shot.clip?.id).toBe(state.clipIds?.[index]);
  });
  const written = (await fakeClaudeRequests(request)).filter((r) => r.system.includes('圖生影片') && r.user.includes(`分鏡 ${seq}，`) && r.user.includes(instruction));
  expect(written.length).toBeGreaterThan(0);
});

// ── 成品 API ──

When(/^我透過 API (下載成品|確認成品|重生第 2 格首格後確認成品)$/, async ({ request, state }, action: string) => {
  const videoId = requireVideoId(state);
  if (action === '下載成品') {
    state.lastResponse = await request.get(`/api/videos/${videoId}/final/download`);
    return;
  }
  if (action === '重生第 2 格首格後確認成品') {
    const key = (await currentPlan(request, videoId))?.shots[1]?.shotKey;
    const consent = await request.post(`/api/videos/${videoId}/consents`, { data: { items: [{ model: 'nano-banana-pro', units: 1 }] } });
    const { consentToken } = (await consent.json()) as { consentToken: string };
    expect((await request.post(`/api/videos/${videoId}/shots/${key}/regenerate`, { data: { kind: 'first', consentToken } })).status()).toBe(202);
    await expect.poll(async () => framesResponseSchema.parse(await (await request.get(`/api/videos/${videoId}/frames`)).json()).generating, { timeout: 20_000 }).toBe(false);
  }
  state.lastResponse = await request.post(`/api/videos/${videoId}/final/confirm`);
});

// ── 複製影片 ──

When('我透過 API 複製這支影片', async ({ request, state }) => {
  state.lastResponse = await request.post(`/api/videos/${requireVideoId(state)}/copy`);
  if (state.lastResponse.status() === 201) state.copiedVideoId = ((await state.lastResponse.json()) as { video: { id: string } }).video.id;
});

When('我透過 API 複製一支不存在的影片', async ({ request, state }) => {
  state.lastResponse = await request.post('/api/videos/no-such-video/copy');
});

Then('網址是新影片的建立影片頁', async ({ page, request, state }) => {
  const source = requireVideoId(state);
  await expect(page).toHaveURL(/\/series\/[^/]+\/videos\/new\?video=/, { timeout: 20_000 });
  const copied = new URL(page.url()).searchParams.get('video');
  expect(copied).toBeTruthy();
  expect(copied).not.toBe(source);
  state.copiedVideoId = copied ?? undefined;
  const detail = await fetchDetail(request, copied ?? '');
  expect(page.url()).toContain(`/series/${detail.video.seriesId}/videos/new`);
});

Then(/^「(.+)」可以選$/, async ({ page }, label: string) => {
  // 建立影片頁的模型是以 legend 命名的群組，每個模型是一個可以按的選項按鈕（aria-pressed）
  const options = page.getByRole('group', { name: label, exact: true }).getByRole('button');
  await expect(options.first()).toBeEnabled({ timeout: 20_000 });
});

Then('新影片的複製來源是原影片', async ({ request, state }) => {
  const detail = await fetchDetail(request, requireCopy(state));
  expect(detail.video.copiedFromVideoId).toBe(requireVideoId(state));
});

Then(/^新影片的寺廟是「(.+)」，階段是「(.+)」，模型還沒有鎖定$/, async ({ request, state }, temple: string, stage: string) => {
  const detail = await fetchDetail(request, requireCopy(state));
  expect(detail.temple.name).toBe(temple);
  expect(detail.video.stage).toBe(stage);
  expect(detail.video.modelsLockedAt).toBeNull();
});

Then('新影片的問卷答案和原影片相同，而且已經送出', async ({ request, state }) => {
  const read = async (id: string) => questionnaireResponseSchema.parse(await (await request.get(`/api/videos/${id}/questionnaire`)).json()).questionnaire;
  const [source, copy] = await Promise.all([read(requireVideoId(state)), read(requireCopy(state))]);
  expect(copy?.answers).toEqual(source?.answers);
  expect(copy?.submittedAt).not.toBeNull();
});

Then('新影片的分鏡方案內容和原影片現行方案相同', async ({ request, state }) => {
  const [source, copy] = await Promise.all([currentPlan(request, requireVideoId(state)), currentPlan(request, requireCopy(state))]);
  if (!source || !copy) throw new Error('沒有方案');
  expect(copy.version).toBe(1);
  // 照片不複製，所以對應照片清空；其他內容相同
  const content = (shots: typeof source.shots) => shots.map(({ photoId: _photo, ...rest }) => rest);
  expect(content(copy.shots)).toEqual(content(source.shots));
  expect(copy.shots.every((shot) => shot.photoId === null)).toBe(true);
});

Then('新影片沒有自己的照片，也沒有寺廟定裝版、精緻圖、影片與成品', async ({ request, state }) => {
  const id = requireCopy(state);
  const detail = await fetchDetail(request, id);
  // 同系列同一間廟的照片是共用的（video_id 為 null，第 5 階段）；複製不會產生這支影片自己的照片
  expect(detail.photos.filter((photo) => photo.videoId === id)).toEqual([]);
  expect(detail.video.templeBoardVersionId).toBeNull();
  const frames = framesResponseSchema.parse(await (await request.get(`/api/videos/${id}/frames`)).json());
  expect(frames.shots.every((shot) => shot.first === null && shot.last === null)).toBe(true);
  const clips = await fetchClips(request, id);
  expect(clips.shots.every((shot) => shot.clip === null)).toBe(true);
  expect(clips.final).toBeNull();
});

Then('新影片的角色沒有定裝圖、還沒確認', async ({ request, state }) => {
  const { characters } = characterListResponseSchema.parse(await (await request.get(`/api/videos/${requireCopy(state)}/characters`)).json());
  expect(characters.length).toBeGreaterThan(0);
  for (const character of characters) {
    expect(character.version.lookAssetId).toBeNull();
    expect(character.state).not.toBe('confirmed');
  }
});

// 同意門檻是全域設定，其他情境會並行修改：需要同意時才會跳出費用確認
When(/^我按下「(.+)」，需要時在費用確認對話框按下「(.+)」$/, async ({ page }, name: string, confirm: string) => {
  await page.getByRole('button', { name, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '費用確認' });
  const generating = page.getByRole('heading', { level: 2, name: '生成中', exact: true });
  await expect(dialog.or(generating)).toBeVisible({ timeout: 20_000 });
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: confirm, exact: true }).click();
});
