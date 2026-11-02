import { readFileSync } from 'node:fs';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { assetResponseSchema, type DeidBox } from '@templeyard/shared';
import { installFakeFaceDetector } from '../../fakes/face-detector';
import { Given, Then, When } from './fixtures';
import {
  createVideoViaApi,
  fetchVideoDetail,
  photoFixture,
  photoFixtureBase64,
  photoFrom,
  uploadOriginalViaApi,
  uploadPhotoViaApi,
  videoIdFrom,
} from './support/api';

type State = { seriesId?: string; videoIds?: string[]; uploadedFiles?: string[] };

function requireSeriesId(state: State): string {
  if (!state.seriesId) throw new Error('這個場景還沒有建立系列');
  return state.seriesId;
}

function requireVideoId(state: State): string {
  const id = state.videoIds?.at(-1);
  if (!id) throw new Error('這個場景還沒有建立影片');
  return id;
}

function photoSection(page: Page) {
  return page.getByRole('region', { name: '上傳寺廟照片' });
}

function photoCards(page: Page) {
  return photoSection(page).getByRole('article');
}

function photoCard(page: Page, name: string) {
  return page.getByRole('article', { name, exact: true });
}

function maskDialog(page: Page) {
  return page.getByRole('dialog');
}

function boxList(page: Page) {
  return maskDialog(page).getByRole('list', { name: '遮蔽框清單' });
}

function boxItem(page: Page, label: string) {
  return boxList(page).getByRole('listitem').filter({ hasText: label });
}

function viewRow(page: Page, view: string) {
  return page
    .getByRole('region', { name: '視角對照' })
    .getByRole('listitem')
    .filter({ has: page.getByText(view, { exact: true }) });
}

function parseNames(text: string): string[] {
  return [...text.matchAll(/「([^」]+)」/g)].map((match) => match[1] ?? '');
}

/** 選檔之後等去識別與上傳完成：照片張數到位，或出現錯誤訊息 */
async function waitForUploads(page: Page, expectedCount: number): Promise<void> {
  const done = expectedCount > 0 ? photoCards(page).nth(expectedCount - 1) : page.getByRole('alert');
  await expect(page.getByRole('alert').or(done).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('正在去識別照片…')).toHaveCount(0, { timeout: 15_000 });
}

// ── 假的人臉偵測 ──

Given(/^人臉偵測會在照片裡找到 (\d+) 張臉$/, async ({ page }, count: string) => {
  await installFakeFaceDetector(page, { faces: Number(count) });
});

Given('人臉偵測沒有找到臉', async ({ page }) => {
  await installFakeFaceDetector(page, { faces: 0 });
});

Given('人臉偵測無法使用', async ({ page }) => {
  await installFakeFaceDetector(page, 'unavailable');
});

// ── 上傳 ──

When(/^我上傳照片((?:「[^」]+」)+)$/, async ({ page, state }, list: string) => {
  const names = parseNames(list);
  const before = await photoCards(page).count();
  await page.getByLabel('上傳照片', { exact: true }).setInputFiles(names.map(photoFixture));
  state.uploadedFiles = names;
  await waitForUploads(page, Math.min(before + names.length, 5));
});

When(/^我從視角對照補傳「(.+)」的照片「(.+)」$/, async ({ page, state }, view: string, file: string) => {
  const before = await photoCards(page).count();
  const chooser = page.waitForEvent('filechooser');
  await viewRow(page, view).getByRole('button', { name: `補傳：${view}` }).click();
  await (await chooser).setFiles(photoFixture(file));
  state.uploadedFiles = [file];
  await waitForUploads(page, before + 1);
});

When(/^我為同一個系列再建立一支「(.+)」的影片$/, async ({ page, request, state }, temple: string) => {
  const seriesId = requireSeriesId(state);
  const { response } = await createVideoViaApi(request, seriesId, temple);
  expect(response.status()).toBe(201);
  const videoId = await videoIdFrom(response);
  state.videoIds = [...(state.videoIds ?? []), videoId];
  await page.goto(`/series/${seriesId}/videos/new?video=${videoId}`);
});

Then(/^寺廟照片有 (\d+) 張(?:，都標示「(.+)」)?$/, async ({ page }, count: string, tag: string | undefined) => {
  await expect(photoCards(page)).toHaveCount(Number(count));
  if (tag) {
    for (const card of await photoCards(page).all()) {
      await expect(card.getByText(tag, { exact: true })).toBeVisible();
    }
  }
});

Then(/^「([^」]+)」不能使用$/, async ({ page }, label: string) => {
  await expect(page.getByLabel(label, { exact: true })).toBeDisabled();
});

Then(/^我看到錯誤訊息「(.+)」$/, async ({ page }, message: string) => {
  await expect(page.getByRole('alert')).toHaveText(message);
});

// ── 遮蔽是否真的發生：讀出圖片的像素 ──

type Point = { x: number; y: number };

async function samplePixels(page: Page, url: string, points: Point[]): Promise<number[][]> {
  return page.evaluate(
    async ({ src, at }) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('沒有 canvas 2D');
      context.drawImage(image, 0, 0);
      return at.map((p) => {
        const x = Math.min(canvas.width - 1, Math.floor(p.x * canvas.width));
        const y = Math.min(canvas.height - 1, Math.floor(p.y * canvas.height));
        return Array.from(context.getImageData(x, y, 1, 1).data.slice(0, 3));
      });
    },
    { src: url, at: points },
  );
}

/** 依介面的命名規則（臉孔 N、遮蔽框 N、車牌 N）找出 API 裡的框 */
function boxByLabel(boxes: readonly DeidBox[], label: string): DeidBox {
  const name = label.replace(/（.+）$/, '');
  const match = /^(臉孔|遮蔽框|車牌) (\d+)$/.exec(name);
  if (!match) throw new Error(`看不懂這個框的名稱：${label}`);
  const group = boxes.filter((box) =>
    match[1] === '臉孔'
      ? box.kind === 'face' && box.source === 'auto'
      : match[1] === '遮蔽框'
        ? box.kind === 'face' && box.source === 'manual'
        : box.kind === 'plate',
  );
  const box = group[Number(match[2]) - 1];
  if (!box) throw new Error(`這張照片沒有「${label}」`);
  return box;
}

function center(box: DeidBox): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** 同一點在去識別圖與原圖的差異：差很多代表被遮蔽（JPEG 有些許誤差） */
async function maskedAt(page: Page, request: APIRequestContext, videoId: string, points: (boxes: DeidBox[]) => Point[]) {
  const { photos } = await fetchVideoDetail(request, videoId);
  const photo = photos[0];
  if (!photo) throw new Error('還沒有照片');
  const at = points(photo.deidBoxes);
  const deid = await samplePixels(page, `/api/assets/${photo.deidentifiedAssetId}`, at);
  const original = await samplePixels(page, `/api/assets/${photo.originalAssetId}`, at);
  return deid.map((pixel, i) => Math.max(...pixel.map((value, c) => Math.abs(value - (original[i]?.[c] ?? 0)))) > 40);
}

Then(/^去識別後的照片在((?:「[^」]+」)+)的位置(被遮蔽|沒有被遮蔽)$/, async ({ page, request, state }, list: string, result: string) => {
  const labels = parseNames(list);
  const expected = labels.map(() => result === '被遮蔽');
  await expect
    .poll(() => maskedAt(page, request, requireVideoId(state), (boxes) => labels.map((l) => center(boxByLabel(boxes, l)))))
    .toEqual(expected);
});

Then(/^去識別後的照片在左上角（(\d+)%, (\d+)%）被遮蔽$/, async ({ page, request, state }, x: string, y: string) => {
  const point = { x: Number(x) / 100, y: Number(y) / 100 };
  await expect.poll(() => maskedAt(page, request, requireVideoId(state), () => [point])).toEqual([true]);
});

Then(/^原圖在((?:「[^」]+」)+)的位置沒有被遮蔽$/, async ({ page, request, state }, list: string) => {
  const labels = parseNames(list);
  const { photos } = await fetchVideoDetail(request, requireVideoId(state));
  const photo = photos[0];
  if (!photo) throw new Error('還沒有照片');
  const at = labels.map((l) => center(boxByLabel(photo.deidBoxes, l)));
  // 原圖是純色的 fixture：框中心的顏色要和左上角（沒有框的地方）一樣
  const [corner] = await samplePixels(page, `/api/assets/${photo.originalAssetId}`, [{ x: 0.99, y: 0.01 }]);
  const pixels = await samplePixels(page, `/api/assets/${photo.originalAssetId}`, at);
  for (const pixel of pixels) expect(pixel).toEqual(corner);
});

Then('這張照片的原圖與去識別圖是兩個不同的檔案', async ({ request, state }) => {
  const { photos } = await fetchVideoDetail(request, requireVideoId(state));
  const photo = photos[0];
  if (!photo) throw new Error('還沒有照片');
  expect(photo.originalAssetId).not.toBe(photo.deidentifiedAssetId);
  const original = await (await request.get(`/api/assets/${photo.originalAssetId}`)).body();
  const deid = await (await request.get(`/api/assets/${photo.deidentifiedAssetId}`)).body();
  expect(original.equals(deid)).toBe(false);
});

Then('原圖的內容與我上傳的檔案完全相同', async ({ request, state }) => {
  const { photos } = await fetchVideoDetail(request, requireVideoId(state));
  const file = state.uploadedFiles?.[0];
  if (!photos[0] || !file) throw new Error('還沒有照片');
  const original = await (await request.get(`/api/assets/${photos[0].originalAssetId}`)).body();
  expect(original.equals(readFileSync(photoFixture(file)))).toBe(true);
});

// ── 遮蔽編輯 ──

When(/^我打開「(.+)」的遮蔽編輯$/, async ({ page }, photo: string) => {
  await photoCard(page, photo).getByRole('button', { name: '調整遮蔽' }).click();
  await expect(maskDialog(page)).toBeVisible();
});

Then(/^遮蔽框清單的「(.+)」標示「(.+)」$/, async ({ page }, label: string, tag: string) => {
  await expect(boxItem(page, label).getByText(tag, { exact: true })).toBeVisible();
});

Then(/^遮蔽框清單(有|沒有)「(.+)」$/, async ({ page }, has: string, label: string) => {
  await expect(boxItem(page, label)).toHaveCount(has === '有' ? 1 : 0);
});

Then(/^我看到「(.+)」按鈕$/, async ({ page }, name: string) => {
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
});

Then(/^沒有「(.+)」按鈕$/, async ({ page }, name: string) => {
  await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
});

When(/^我把「(.+)」的「(.+)」改成「(.+)」$/, async ({ page }, box: string, field: string, value: string) => {
  const group = maskDialog(page).getByRole('group', { name: new RegExp(`^${box}(（|$)`) });
  await group.getByLabel(field, { exact: true }).fill(value);
});

// ── 視角對照 ──

Then(/^視角對照的「(.+)」顯示「(.+)」$/, async ({ page }, view: string, status: string) => {
  await expect(viewRow(page, view).getByText(status, { exact: true })).toBeVisible();
});

When(/^我把「(.+)」的「拍到的視角」選成「(.+)」$/, async ({ page }, photo: string, view: string) => {
  await photoCard(page, photo).getByLabel('拍到的視角').selectOption({ label: view });
});

Then(/^「(.+)」的「拍到的視角」是「(.+)」$/, async ({ page }, photo: string, view: string) => {
  await expect(photoCard(page, photo).getByLabel('拍到的視角').locator('option:checked')).toHaveText(view);
});

// ── 照片 API ──

Given(/^我透過 API 上傳 (\d+) 張照片$/, async ({ request, state }, count: string) => {
  for (let i = 0; i < Number(count); i += 1) {
    const response = await uploadPhotoViaApi(request, requireVideoId(state));
    expect(response.status()).toBe(201);
  }
});

When('我透過 API 再上傳 1 張照片', async ({ request, state }) => {
  state.lastResponse = await uploadPhotoViaApi(request, requireVideoId(state));
});

When(/^我透過 API 上傳照片，但(.+)$/, async ({ request, state }, situation: string) => {
  const videoId = requireVideoId(state);
  const png = { mime: 'image/png', dataBase64: photoFixtureBase64() };
  switch (situation) {
    case '原圖不存在':
      state.lastResponse = await request.post(`/api/videos/${videoId}/photos`, {
        data: { originalAssetId: 'no-such-asset', deidentified: png, deidBoxes: [] },
      });
      return;
    case '原圖編號是去識別後的圖': {
      const first = await photoFrom(await uploadPhotoViaApi(request, videoId));
      state.lastResponse = await uploadPhotoViaApi(request, videoId, { originalAssetId: first.deidentifiedAssetId });
      return;
    }
    case '圖片格式不支援':
      state.lastResponse = await uploadPhotoViaApi(request, videoId, { deidentified: { ...png, mime: 'image/gif' } });
      return;
    case '遮蔽框超出照片範圍':
      state.lastResponse = await uploadPhotoViaApi(request, videoId, {
        deidBoxes: [{ id: 'auto-1', kind: 'face', source: 'auto', x: 0.9, y: 0.1, width: 0.3, height: 0.2, cancelled: false }],
      });
      return;
    default:
      throw new Error(`沒有定義這種錯誤資料：${situation}`);
  }
});

When('我透過 API 上傳一張原圖', async ({ request, state }) => {
  state.lastResponse = await uploadOriginalViaApi(request, requireVideoId(state));
});

Then('這個原圖檔案標示不能送往雲端', async ({ state }) => {
  if (!state.lastResponse) throw new Error('還沒有送出請求');
  const { asset } = assetResponseSchema.parse(await state.lastResponse.json());
  expect(asset).toMatchObject({ kind: 'original_photo', cloudOk: false });
});
