import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createClaudeModel } from '@templeyard/agent';
import { createComfyClient, createMcpSession, createMcpUploadTransport } from '@templeyard/comfy-client';
import { loadWorkflowConfig, workflowsFile } from '@templeyard/prompts';
import { buildApp, type GenerationRuntime, type TextRuntime } from './app.js';
import { createClaudePromptWriter } from './claude/writer.js';
import { openDatabase } from './db/client.js';
import { repoRoot, resolveDataDir, templesCsvPath } from './paths.js';
import { generationUnavailableMessage, readGenerationEnv, readTextEnv, textUnavailableMessage } from './runtime/env.js';
import { importTemples } from './temples/import.js';
import { countTemples } from './temples/repository.js';

// 金鑰放在 repo 根目錄的 .env.local（.env.example 只有名稱）；已經設定的環境變數不會被覆蓋。
// 情境測試設定 TEMPLEYARD_NO_ENV_FILE，只用假的服務，不讀 .env.local。
const envFile = path.join(repoRoot, '.env.local');
if (!process.env.TEMPLEYARD_NO_ENV_FILE && existsSync(envFile)) process.loadEnvFile(envFile);

// 留白（例如照 .env.example 複製後沒填）時用預設 3001
const port = Number(process.env.API_PORT?.trim() || 3001);
const dataDir = resolveDataDir();
mkdirSync(dataDir, { recursive: true });
const db = openDatabase(path.join(dataDir, 'app.db'));

// 第一次啟動時自動匯入寺廟資料；失敗時仍啟動後端，只是寺廟搜尋沒有資料
try {
  if (countTemples(db) === 0) {
    const result = importTemples(db, readFileSync(templesCsvPath, 'utf8'));
    console.log(`已匯入寺廟資料：共 ${result.total} 筆，有效 ${result.active} 間`);
  }
} catch (error: unknown) {
  console.error('寺廟資料匯入失敗，請執行 pnpm db:import 重試', error);
}

// 工作流程設定：預設 workflows/models.json；情境測試用 WORKFLOWS_FILE 指到有假上傳工具的設定
const workflows = loadWorkflowConfig(process.env.WORKFLOWS_FILE ? path.resolve(repoRoot, process.env.WORKFLOWS_FILE) : workflowsFile);

// 生成用的外部連線：環境變數不齊時不建立，生成端點回 503 說明缺少哪些（不印出任何值）
const env = readGenerationEnv(process.env);
let generation: GenerationRuntime | null = null;
if (env.config) {
  const session = createMcpSession({ url: env.config.comfy.url, apiKey: env.config.comfy.apiKey });
  generation = {
    comfy: createComfyClient({ session, pollMs: env.config.comfy.pollMs }),
    writer: createClaudePromptWriter({
      apiKey: env.config.claude.apiKey,
      model: env.config.claude.model,
      ...(env.config.claude.baseURL ? { baseURL: env.config.claude.baseURL } : {}),
    }),
    transport: createMcpUploadTransport(session, workflows.upload),
    maxConcurrent: env.config.comfy.maxConcurrent,
  };
} else {
  console.log(`生成服務還沒設定，缺少：${env.missing.join('、')}`);
}

// 文字 AI（創作 Agent、AI 輔助撰寫）只需要 Claude；環境變數不齊時對話與 AI 幫我寫回 503
const textEnv = readTextEnv(process.env);
let text: TextRuntime | null = null;
if (textEnv.config) {
  const claude = { apiKey: textEnv.config.apiKey, ...(textEnv.config.baseURL ? { baseURL: textEnv.config.baseURL } : {}) };
  text = {
    agent: createClaudeModel({ ...claude, model: textEnv.config.agentModel }),
    assist: createClaudeModel({ ...claude, model: textEnv.config.assistModel }),
  };
} else {
  console.log(`Claude 還沒設定，缺少：${textEnv.missing.join('、')}`);
}

const app = buildApp({
  db,
  assetsDir: path.join(dataDir, 'assets'),
  workflows,
  generation,
  generationUnavailableMessage: generationUnavailableMessage(env.missing),
  text,
  textUnavailableMessage: textUnavailableMessage(textEnv.missing),
});

app.listen({ port, host: '127.0.0.1' }).then(
  () => {
    console.log(`廟埕影室後端已啟動：http://127.0.0.1:${port}`);
  },
  (error: unknown) => {
    console.error('後端啟動失敗', error);
    process.exit(1);
  },
);
