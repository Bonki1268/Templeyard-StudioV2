import { expect, type APIRequestContext } from '@playwright/test';
import { templeSearchResponseSchema, type TempleSummary } from '@templeyard/shared';
import { Given, Then, When } from './fixtures';

// 透過前端的 /api 代理呼叫後端，並以 schema 驗證回應
async function searchTemples(
  request: APIRequestContext,
  params: Record<string, string>,
): Promise<TempleSummary[]> {
  const response = await request.get('/api/temples', { params });
  expect(response.status()).toBe(200);
  return templeSearchResponseSchema.parse(await response.json()).temples;
}

// cucumber expression 的「/」代表「或」，所以用正規表示式
Given(/^寺廟資料庫已從 data\/temples\.csv 匯入$/, async ({ request }) => {
  const temples = await searchTemples(request, { limit: '1' });
  expect(temples).toHaveLength(1);
});

When(/^我搜尋「(.+)」並要求包含已廢止與未登記的寺廟$/, async ({ request, state }, q: string) => {
  state.temples = await searchTemples(request, { q, includeInactive: 'true', limit: '100' });
});

When(/^我搜尋「([^」]+)」$/, async ({ request, state }, q: string) => {
  state.temples = await searchTemples(request, { q, limit: '100' });
});

function results(state: { temples?: TempleSummary[] }): TempleSummary[] {
  if (!state.temples) throw new Error('還沒有搜尋');
  return state.temples;
}

Then(/^搜尋結果包含「(.+)」$/, async ({ state }, name: string) => {
  expect(results(state).map((t) => t.name)).toContain(name);
});

Then(/^搜尋結果不包含「(.+)」$/, async ({ state }, name: string) => {
  expect(results(state).map((t) => t.name)).not.toContain(name);
});

Then(/^第一筆結果是「(.+)」$/, async ({ state }, name: string) => {
  expect(results(state)[0]?.name).toBe(name);
});

Then('搜尋結果不是空的', async ({ state }) => {
  expect(results(state).length).toBeGreaterThan(0);
});

Then(/^每一筆結果的行政區都是「(.+)」$/, async ({ state }, district: string) => {
  for (const temple of results(state)) expect(temple.district).toBe(district);
});

Then(/^每一筆結果的主祀神明都包含「(.+)」$/, async ({ state }, deity: string) => {
  for (const temple of results(state)) expect(temple.deity).toContain(deity);
});

Then(/^搜尋結果有 (\d+) 筆名為「(.+)」$/, async ({ state }, count: string, name: string) => {
  state.matched = results(state).filter((t) => t.name === name);
  expect(state.matched).toHaveLength(Number(count));
});

Then(/^這些結果的行政區分別是「(.+)」與「(.+)」$/, async ({ state }, a: string, b: string) => {
  if (!state.matched) throw new Error('還沒有篩選同名結果');
  expect(state.matched.map((t) => t.district).sort()).toEqual([a, b].sort());
});
