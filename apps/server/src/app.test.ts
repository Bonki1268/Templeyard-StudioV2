import { healthResponseSchema } from '@templeyard/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

describe('健康檢查 GET /api/health', () => {
  const app = buildApp();

  afterEach(async () => {
    await app.close();
  });

  it('後端正常時回應 200 與狀態 ok', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(healthResponseSchema.parse(response.json())).toEqual({ status: 'ok' });
  });
});
