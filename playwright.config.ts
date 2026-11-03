import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

// 情境測試用獨立的連接埠，不和 pnpm dev 衝突。
const API_PORT = 3101;
const WEB_PORT = 5174;
// Prompt Studio（生成指令管理頁）：用 prompts 的複本，情境測試儲存時不會改到 prompt-studio/prompts/
const PROMPT_STUDIO_PORT = 3301;
// 假的 Comfy Cloud MCP 與假的 Claude API：情境測試不連到任何外部服務
const FAKE_COMFY_PORT = 3401;
const FAKE_CLAUDE_PORT = 3501;
// 假的上傳工具與參考圖位置只寫在情境測試的設定檔（真的格式待實測，07「下一輪測試」）
const E2E_WORKFLOWS_FILE = path.resolve('tests/fakes/comfy-mcp/workflows.e2e.json');

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
      // 情境測試用獨立的資料庫，啟動時自動匯入 data/temples.csv；生成都送到假的服務（值都是假的，不是金鑰）
      env: {
        API_PORT: String(API_PORT),
        DATA_DIR: '.e2e-data',
        // 不讀 .env.local：情境測試只用假的服務
        TEMPLEYARD_NO_ENV_FILE: '1',
        COMFY_MCP_URL: `http://127.0.0.1:${FAKE_COMFY_PORT}/mcp`,
        COMFY_CLOUD_API_KEY: 'fake-comfy-key',
        COMFY_MAX_CONCURRENT: '3',
        COMFY_POLL_MS: '100',
        ANTHROPIC_API_KEY: 'fake-claude-key',
        ANTHROPIC_BASE_URL: `http://127.0.0.1:${FAKE_CLAUDE_PORT}`,
        CLAUDE_MODEL_ASSIST: 'fake-claude-model',
        CLAUDE_MODEL_AGENT: 'fake-claude-agent-model',
        WORKFLOWS_FILE: E2E_WORKFLOWS_FILE,
      },
      reuseExistingServer: false,
    },
    {
      command: 'pnpm --filter @templeyard/server exec tsx ../../tests/fakes/comfy-mcp/main.ts',
      url: `http://127.0.0.1:${FAKE_COMFY_PORT}/__calls`,
      env: { FAKE_COMFY_PORT: String(FAKE_COMFY_PORT) },
      reuseExistingServer: false,
    },
    {
      command: 'pnpm --filter @templeyard/server exec tsx ../../tests/fakes/claude/main.ts',
      url: `http://127.0.0.1:${FAKE_CLAUDE_PORT}/__requests`,
      env: { FAKE_CLAUDE_PORT: String(FAKE_CLAUDE_PORT) },
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
