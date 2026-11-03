import type { z } from 'zod';
import type { ClaudeModel, Usage } from './types.js';

// 結構化輸出（02「結構化輸出」）：以工具的輸入 schema 取得 JSON，再用 Zod 驗證；
// 驗證失敗就要求 Claude 修正一次，仍失敗則回報錯誤。

export class StructuredOutputError extends Error {
  override name = 'StructuredOutputError';
}

export type StructuredRequest<T> = {
  model: ClaudeModel;
  system: string;
  user: string;
  tool: { name: string; description: string; schema: z.ZodType<T> };
  /** 錯誤訊息裡的對象，例如「分鏡方案」 */
  subject: string;
  maxTokens?: number;
};

/**
 * - 指定 Claude 一定要用這個工具（tool_choice），送出的 input_schema 由 Zod schema 轉出
 * - 工具輸入不符合 schema（或沒有用工具）：把錯誤當成工具結果回給 Claude，要求修正一次
 * - 修正後仍不正確：丟出 StructuredOutputError「Agent 回的<對象>格式不正確，請再試一次」
 * - Claude 拒絕：「Claude 拒絕回覆這段內容，請修改後再試」；被截斷：「Agent 的回覆太長被截斷，請再試一次」
 */
export async function requestToolInput<T>(_request: StructuredRequest<T>): Promise<{ value: T; usage: Usage }> {
  throw new Error('尚未實作');
}
