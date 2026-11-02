import { startFakeClaude } from './server.js';

// 情境測試用：獨立啟動假的 Claude API（playwright.config.ts 的 webServer）
const port = Number(process.env.FAKE_CLAUDE_PORT ?? 3501);
const fake = await startFakeClaude({ port });
console.log(`假的 Claude API：${fake.url}`);
