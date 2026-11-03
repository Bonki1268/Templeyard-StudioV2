import type { ClaudeModel } from './types.js';

// Claude API 的轉接：用官方 SDK 呼叫 Messages API，轉成 types.ts 的型別。
// 模型代號由呼叫端從環境變數帶入（CLAUDE_MODEL_AGENT、CLAUDE_MODEL_ASSIST），程式不寫死。

export type ClaudeModelOptions = {
  apiKey: string;
  model: string;
  /** 測試把 SDK 指到假的 Claude API */
  baseURL?: string;
  /** 預設 4096 */
  maxTokens?: number;
};

/**
 * 錯誤一律轉成 ClaudeCallError：
 * - 金鑰不正確：「Claude API 的金鑰不正確，請檢查 ANTHROPIC_API_KEY」
 * - 其他 HTTP 錯誤：「Claude API 回應錯誤（HTTP 500）」
 * - 連不上：「連不上 Claude API，請確認網路」
 */
export function createClaudeModel(_options: ClaudeModelOptions): ClaudeModel {
  throw new Error('尚未實作');
}
