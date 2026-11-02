// 讀取生成相關的環境變數（02「環境變數」）。金鑰只從環境變數來，不寫進程式、紀錄或 commit。

export type GenerationEnv = {
  comfy: { url: string; apiKey: string; maxConcurrent: number; pollMs: number };
  claude: { apiKey: string; model: string; baseURL: string | undefined };
};

export type GenerationEnvResult = { config: GenerationEnv; missing: [] } | { config: null; missing: string[] };

/**
 * 必填：COMFY_MCP_URL、COMFY_CLOUD_API_KEY、ANTHROPIC_API_KEY、CLAUDE_MODEL_ASSIST；缺少時回傳缺少的名稱（不含值）。
 * 選填：COMFY_MAX_CONCURRENT（預設 1）、COMFY_POLL_MS（預設 4000）、ANTHROPIC_BASE_URL。
 * 數字不合法時當成缺少。
 */
export function readGenerationEnv(_env: Record<string, string | undefined>): GenerationEnvResult {
  throw new Error('尚未實作');
}

/** 生成服務沒有設定時，生成端點回給使用者的說明 */
export function generationUnavailableMessage(_missing: readonly string[]): string {
  throw new Error('尚未實作');
}
