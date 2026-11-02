import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

// 情境測試用獨立的連接埠，不和 pnpm dev 衝突。
const API_PORT = 3101;
const WEB_PORT = 5174;
// Prompt Studio（生成指令管理頁）：用 prompts 的複本，情境測試儲存時不會改到 prompt-studio/prompts/
const PROMPT_STUDIO_PORT = 3301;

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
      // 每次執行前清空情境測試的資料庫，啟動時重新匯入寺廟資料
      command:
        "node -e \"require('node:fs').rmSync('.e2e-data', { recursive: true, force: true })\" && pnpm --filter @templeyard/server start",
      port: API_PORT,
      // 情境測試用獨立的資料庫，啟動時自動匯入 data/temples.csv
      env: { API_PORT: String(API_PORT), DATA_DIR: '.e2e-data' },
      reuseExistingServer: false,
    },
    {
      command:
        "node -e \"const fs=require('node:fs');fs.rmSync('.e2e-prompts',{recursive:true,force:true});fs.cpSync('prompt-studio/prompts','.e2e-prompts',{recursive:true})\" && node prompt-studio/server.js",
      port: PROMPT_STUDIO_PORT,
      env: { PORT: String(PROMPT_STUDIO_PORT), PROMPT_DIR: '.e2e-prompts' },
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
