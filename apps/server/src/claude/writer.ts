import Anthropic from '@anthropic-ai/sdk';
import type { PromptWriter } from '@templeyard/prompts';
import { writtenPromptSchema, type WrittenPrompt } from '@templeyard/shared';

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
const FORMAT_ERROR = 'Claude 回的最終指令格式不正確，請再試一次';

export function parseWrittenPrompt(text: string): WrittenPrompt {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  let parsed: unknown;
  try {
    parsed = JSON.parse(fenced?.[1] ?? trimmed);
  } catch {
    throw new ClaudeOutputError(FORMAT_ERROR);
  }
  const result = writtenPromptSchema.safeParse(parsed);
  if (!result.success) throw new ClaudeOutputError(FORMAT_ERROR);
  return result.data;
}

/**
 * 送出：system 是節點指令與模型寫法，user 是帶入資料後的內容；重寫時把 retryNote 接在 user 後面。
 * 回應被拒絕（stop_reason 為 refusal）或被截斷（max_tokens）時丟出 ClaudeOutputError。
 */
export function createClaudePromptWriter(options: ClaudeWriterOptions): PromptWriter {
  const client = new Anthropic({ apiKey: options.apiKey, ...(options.baseURL ? { baseURL: options.baseURL } : {}) });
  return {
    async write(request, writeOptions) {
      const content = request.messages.map((message) => message.content).join('\n\n');
      const user = writeOptions?.retryNote ? `${content}\n\n${writeOptions.retryNote}` : content;
      let response: Anthropic.Message;
      try {
        response = await client.messages.create({
          model: options.model,
          max_tokens: options.maxTokens ?? 16000,
          system: request.system,
          messages: [{ role: 'user', content: user }],
        });
      } catch (error: unknown) {
        // SDK 的錯誤訊息不含金鑰；只保留狀態碼，避免把回應內容塞進紀錄
        if (error instanceof Anthropic.AuthenticationError) throw new Error('Claude API 的金鑰不正確，請檢查 ANTHROPIC_API_KEY');
        if (error instanceof Anthropic.APIError) throw new Error(`Claude API 回應錯誤（HTTP ${error.status ?? '連線失敗'}）`);
        throw new Error('連不上 Claude API，請確認網路');
      }
      if (response.stop_reason === 'refusal') throw new ClaudeOutputError('Claude 拒絕撰寫這段指令，請修改內容後再試');
      if (response.stop_reason === 'max_tokens') throw new ClaudeOutputError('Claude 的回應太長被截斷，請再試一次');
      const text = response.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
      return parseWrittenPrompt(text);
    },
  };
}
