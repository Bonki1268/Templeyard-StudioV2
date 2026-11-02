import { startFakeComfyMcp } from './server.js';

// 情境測試用：獨立啟動假的 Comfy Cloud MCP 伺服器（playwright.config.ts 的 webServer）
const port = Number(process.env.FAKE_COMFY_PORT ?? 3401);
const fake = await startFakeComfyMcp({ port });
console.log(`假的 Comfy Cloud MCP 伺服器：${fake.url}`);
