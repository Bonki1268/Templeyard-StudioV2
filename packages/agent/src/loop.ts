import type { ToolCallSummary } from '@templeyard/shared';
import type { ToolContext, ToolRegistry } from './tools.js';
import type { AgentMessage, ClaudeModel, Usage } from './types.js';

// Agent 的一輪對話：送出 → Claude 要用工具就執行並回傳結果 → 直到 Claude 結束這一輪。

export type AgentTurnEvent = { type: 'text'; text: string } | { type: 'tool'; call: ToolCallSummary };

export type AgentTurnInput = {
  model: ClaudeModel;
  system: string;
  /** 之前的對話（只有文字） */
  history: AgentMessage[];
  userMessage: string;
  registry: ToolRegistry;
  context: ToolContext;
  onEvent?: (event: AgentTurnEvent) => void;
  /** 最多呼叫 Claude 幾次，預設 6 */
  maxSteps?: number;
};

export type AgentTurnResult = {
  /** 這一輪 Agent 說的話（各次回應的文字以空行接起來） */
  text: string;
  toolCalls: ToolCallSummary[];
  usage: Usage;
};

export class AgentTurnError extends Error {
  override name = 'AgentTurnError';
}

/**
 * 規則：
 * - 每次回應的文字依序以 text 事件送出；每個工具的結果以 tool 事件送出
 * - 工具輸入格式不正確：把錯誤當成工具結果回給 Claude，要求修正一次；同一個工具第二次仍不正確就停止，
 *   丟出「Agent 回的<對象>格式不正確，請再試一次」
 * - Claude 拒絕回覆：「Claude 拒絕回覆這段對話，請換個說法再試」
 * - 回覆被截斷：「Agent 的回覆太長被截斷，請再試一次」
 * - 超過 maxSteps：「Agent 執行太多步驟，已停止，請再試一次」
 */
export async function runAgentTurn(_input: AgentTurnInput): Promise<AgentTurnResult> {
  throw new Error('尚未實作');
}
