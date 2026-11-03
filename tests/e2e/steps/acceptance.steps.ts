import { expect } from '@playwright/test';
import { planResponseSchema, templeBoardResponseSchema } from '@templeyard/shared';
import { Then, When } from './fixtures';
import { consentViaApi } from './support/api';

// 第 13 階段（實測前補上）：寺廟定裝版新版本的確認失效

type State = { videoIds?: string[] };

function requireVideoId(state: State): string {
  const id = state.videoIds?.at(-1);
  if (!id) throw new Error('這個場景還沒有建立影片');
  return id;
}

When(/^我透過 API 重生定裝版的「(.+)」，確認這個視角與新版本$/, async ({ request, state }, name: string) => {
  const videoId = requireVideoId(state);
  const board = templeBoardResponseSchema.parse(await (await request.get(`/api/videos/${videoId}/temple-board`)).json()).board;
  const view = board.views.find((v) => v.viewName === name);
  if (!view) throw new Error(`定裝版沒有「${name}」`);
  const consentToken = await consentViaApi(request, videoId, 1);
  expect((await request.post(`/api/videos/${videoId}/temple-board/views/${view.viewKey}/regenerate`, { data: { consentToken } })).status()).toBe(202);
  await expect
    .poll(async () => templeBoardResponseSchema.parse(await (await request.get(`/api/videos/${videoId}/temple-board`)).json()).board.views.find((v) => v.viewKey === view.viewKey)?.state, { timeout: 20_000 })
    .toBe('ready');
  expect((await request.post(`/api/videos/${videoId}/temple-board/views/${view.viewKey}/confirm`)).status()).toBe(200);
  expect((await request.post(`/api/videos/${videoId}/temple-board/confirm`)).status()).toBe(200);
});

// 這份假的方案每一格都用「廟前全景」；只有部分格子受影響的情況由單元測試涵蓋（templeBoards、frames 的失效規則）
Then(/^用到「(.+)」的格子都標示「(.+)」$/, async ({ page, request, state }, name: string, tag: string) => {
  const videoId = requireVideoId(state);
  const board = templeBoardResponseSchema.parse(await (await request.get(`/api/videos/${videoId}/temple-board`)).json()).board;
  const viewKey = board.views.find((v) => v.viewName === name)?.viewKey;
  const { plan } = planResponseSchema.parse(await (await request.get(`/api/videos/${videoId}/plan`)).json());
  const shots = plan?.shots ?? [];
  const using = shots.filter((shot) => shot.viewKey === viewKey);
  expect(using.length).toBeGreaterThan(0);
  for (const shot of using) {
    const card = page.getByRole('list', { name: '精緻圖' }).getByRole('article', { name: `第 ${shot.seq} 格`, exact: true });
    await expect(card.getByText(tag, { exact: true })).toBeVisible({ timeout: 20_000 });
  }
});
