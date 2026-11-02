import { expect } from '@playwright/test';
import { healthResponseSchema } from '@templeyard/shared';
import { Then, When } from './fixtures';

When('我打開首頁', async ({ page }) => {
  await page.goto('/');
});

Then(/^我會看到標題「(.+)」$/, async ({ page }, title: string) => {
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
});

When('我透過前端向後端詢問健康狀態', async ({ request, state }) => {
  // 走前端的 /api 代理，確認前後端接在一起
  state.lastResponse = await request.get('/api/health');
});

Then(/^後端回應的狀態是「(.+)」$/, async ({ state }, expected: string) => {
  const response = state.lastResponse;
  if (!response) throw new Error('還沒有送出請求');
  expect(response.status()).toBe(200);
  const body = healthResponseSchema.parse(await response.json());
  expect(body.status).toBe(expected);
});
