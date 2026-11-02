import type { PromptWriter } from '@templeyard/prompts';
import type { WrittenPrompt } from '@templeyard/shared';

// 圖片與影片節點第 1 段的撰寫者：用 Claude API 把節點指令寫成最終指令（02「生成指令組裝」）。
// 模型代號由環境變數 CLAUDE_MODEL_ASSIST 決定（01「使用哪一個 Claude 模型」待決定），程式不寫死。

export type ClaudeWriterOptions = {
  apiKey: string;
  model: string;
  /** 測試把 SDK 指到假的 Claude API */
  baseURL?: string;
  maxTokens?: number;
};

/** Claude 回的內容不是合法的 { prompt, notes } */
export class ClaudeOutputError extends Error {
  override name = 'ClaudeOutputError';
}

/**
 * 解析 Claude 回的文字：允許前後空白與 ```json 程式碼區塊，內容要符合 writtenPromptSchema；
 * 不合法時丟出 ClaudeOutputError（訊息不含原文，避免把長文字塞進錯誤）
 */
export function parseWrittenPrompt(_text: string): WrittenPrompt {
  throw new Error('尚未實作');
}

/**
 * 送出：system 是節點指令與模型寫法，user 是帶入資料後的內容；重寫時把 retryNote 接在 user 後面。
 * 回應被拒絕（stop_reason 為 refusal）或被截斷（max_tokens）時丟出 ClaudeOutputError。
 */
export function createClaudePromptWriter(_options: ClaudeWriterOptions): PromptWriter {
  throw new Error('尚未實作');
}
