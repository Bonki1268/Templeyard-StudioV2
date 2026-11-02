import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

// 情境測試用獨立的連接埠，不和 pnpm dev 衝突。
const API_PORT = 3101;
const WEB_PORT = 5174;

const testDir = defineBddConfig({
  features: 'features/**/*.feature',
  steps: 'tests/e2e/steps/**/*.ts',
});

export default defineConfig({
  testDir,
  fullyParallel: true,
  forbidOnly: true,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    locale: 'zh-TW',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @templeyard/server start',
      port: API_PORT,
      // 情境測試用獨立的資料庫，啟動時自動匯入 data/temples.csv
      env: { API_PORT: String(API_PORT), DATA_DIR: '.e2e-data' },
      reuseExistingServer: false,
    },
    {
      command: 'pnpm --filter @templeyard/web dev',
      url: `http://127.0.0.1:${WEB_PORT}`,
      env: { API_PORT: String(API_PORT), WEB_PORT: String(WEB_PORT) },
      reuseExistingServer: false,
    },
  ],
});
