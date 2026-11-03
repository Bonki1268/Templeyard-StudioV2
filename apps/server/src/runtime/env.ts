// 讀取生成相關的環境變數（02「環境變數」）。金鑰只從環境變數來，不寫進程式、紀錄或 commit。

export type GenerationEnv = {
  comfy: { url: string; apiKey: string; maxConcurrent: number; pollMs: number };
  claude: { apiKey: string; model: string; baseURL: string | undefined };
};

export type GenerationEnvResult = { config: GenerationEnv; missing: [] } | { config: null; missing: string[] };

const REQUIRED = ['COMFY_MCP_URL', 'COMFY_CLOUD_API_KEY', 'ANTHROPIC_API_KEY', 'CLAUDE_MODEL_ASSIST'] as const;

function text(env: Record<string, string | undefined>, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

/** 選填的正整數：沒填用預設值；填了但不合法回傳 null */
function positiveInt(env: Record<string, string | undefined>, name: string, fallback: number): number | null {
  const raw = text(env, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * 必填：COMFY_MCP_URL、COMFY_CLOUD_API_KEY、ANTHROPIC_API_KEY、CLAUDE_MODEL_ASSIST；缺少時回傳缺少的名稱（不含值）。
 * 選填：COMFY_MAX_CONCURRENT（預設 1）、COMFY_POLL_MS（預設 4000）、ANTHROPIC_BASE_URL。
 * 數字不合法時當成缺少。
 */
export function readGenerationEnv(env: Record<string, string | undefined>): GenerationEnvResult {
  const missing: string[] = REQUIRED.filter((name) => text(env, name) === undefined);
  const maxConcurrent = positiveInt(env, 'COMFY_MAX_CONCURRENT', 1);
  const pollMs = positiveInt(env, 'COMFY_POLL_MS', 4000);
  if (maxConcurrent === null) missing.push('COMFY_MAX_CONCURRENT');
  if (pollMs === null) missing.push('COMFY_POLL_MS');
  const url = text(env, 'COMFY_MCP_URL');
  const comfyKey = text(env, 'COMFY_CLOUD_API_KEY');
  const claudeKey = text(env, 'ANTHROPIC_API_KEY');
  const model = text(env, 'CLAUDE_MODEL_ASSIST');
  if (missing.length > 0 || !url || !comfyKey || !claudeKey || !model || maxConcurrent === null || pollMs === null) {
    return { config: null, missing };
  }
  return {
    config: {
      comfy: { url, apiKey: comfyKey, maxConcurrent, pollMs },
      claude: { apiKey: claudeKey, model, baseURL: text(env, 'ANTHROPIC_BASE_URL') },
    },
    missing: [],
  };
}

/** 生成服務沒有設定時，生成端點回給使用者的說明 */
export function generationUnavailableMessage(missing: readonly string[]): string {
  return `還沒設定生成服務，不能生成：請在 .env.local 設定 ${missing.join('、')}`;
}

/** 文字 AI（創作 Agent、AI 輔助撰寫）的設定：只需要 Claude，不需要 Comfy Cloud */
export type TextEnv = { apiKey: string; baseURL: string | undefined; agentModel: string; assistModel: string };

export type TextEnvResult = { config: TextEnv; missing: [] } | { config: null; missing: string[] };

/**
 * 必填：ANTHROPIC_API_KEY、CLAUDE_MODEL_AGENT、CLAUDE_MODEL_ASSIST；缺少時回傳缺少的名稱（不含值）。
 * 選填：ANTHROPIC_BASE_URL。
 */
export function readTextEnv(env: Record<string, string | undefined>): TextEnvResult {
  const apiKey = text(env, 'ANTHROPIC_API_KEY');
  const agentModel = text(env, 'CLAUDE_MODEL_AGENT');
  const assistModel = text(env, 'CLAUDE_MODEL_ASSIST');
  if (!apiKey || !agentModel || !assistModel) {
    const missing = (['ANTHROPIC_API_KEY', 'CLAUDE_MODEL_AGENT', 'CLAUDE_MODEL_ASSIST'] as const).filter((name) => text(env, name) === undefined);
    return { config: null, missing };
  }
  return { config: { apiKey, baseURL: text(env, 'ANTHROPIC_BASE_URL'), agentModel, assistModel }, missing: [] };
}

/** 文字 AI 沒有設定時，對話與 AI 幫我寫回給使用者的說明 */
export function textUnavailableMessage(missing: readonly string[]): string {
  return `還沒設定 Claude，不能使用創作對話與 AI 幫我寫：請在 .env.local 設定 ${missing.join('、')}`;
}
