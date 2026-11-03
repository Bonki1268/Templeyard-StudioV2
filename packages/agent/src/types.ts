// 與 Claude Messages API 對應的最小型別；packages/agent 的其他部分只依賴這些型別，
// 測試可以用假的 ClaudeModel，正式環境用 claude.ts 的 SDK 轉接。

export type TextBlock = { type: 'text'; text: string };
export type ToolUseBlock = { type: 'tool_use'; id: string; name: string; input: unknown };
export type ToolResultBlock = { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };
export type AgentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export type AgentMessage = { role: 'user' | 'assistant'; content: string | AgentBlock[] };

export type ToolSpec = { name: string; description: string; input_schema: Record<string, unknown> };

export type ModelRequest = {
  system: string;
  messages: AgentMessage[];
  tools?: ToolSpec[];
  /** 指定一定要用某個工具（結構化輸出） */
  toolChoice?: { type: 'tool'; name: string };
  maxTokens?: number;
};

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal' | 'stop_sequence' | 'pause_turn' | 'other';

export type Usage = { inputTokens: number; outputTokens: number };

export type ModelResponse = { content: AgentBlock[]; stopReason: StopReason; usage: Usage };

export interface ClaudeModel {
  create(request: ModelRequest): Promise<ModelResponse>;
}

/** 呼叫 Claude API 失敗（金鑰、HTTP 錯誤、連線）；訊息不含金鑰與回應內容 */
export class ClaudeCallError extends Error {
  override name = 'ClaudeCallError';
}
