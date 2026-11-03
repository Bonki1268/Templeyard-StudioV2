import type { ToolCallSummary } from '@templeyard/shared';
import type { ToolContext, ToolRegistry } from './tools.js';
import type { AgentMessage, ClaudeModel, TextBlock, ToolResultBlock, ToolUseBlock, Usage } from './types.js';

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
export async function runAgentTurn(input: AgentTurnInput): Promise<AgentTurnResult> {
  const messages: AgentMessage[] = [...input.history, { role: 'user', content: input.userMessage }];
  const tools = input.registry.specs();
  const texts: string[] = [];
  const toolCalls: ToolCallSummary[] = [];
  const usage = { inputTokens: 0, outputTokens: 0 };
  const invalidCount = new Map<string, number>();
  const maxSteps = input.maxSteps ?? 6;

  for (let step = 0; step < maxSteps; step += 1) {
    const response = await input.model.create({ system: input.system, messages, tools });
    usage.inputTokens += response.usage.inputTokens;
    usage.outputTokens += response.usage.outputTokens;
    if (response.stopReason === 'refusal') throw new AgentTurnError('Claude 拒絕回覆這段對話，請換個說法再試');
    if (response.stopReason === 'max_tokens') throw new AgentTurnError('Agent 的回覆太長被截斷，請再試一次');

    const text = response.content
      .filter((block): block is TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();
    if (text) {
      texts.push(text);
      input.onEvent?.({ type: 'text', text });
    }

    const uses = response.content.filter((block): block is ToolUseBlock => block.type === 'tool_use');
    if (response.stopReason !== 'tool_use' || uses.length === 0) return { text: texts.join('\n\n'), toolCalls, usage };

    const results: ToolResultBlock[] = [];
    for (const use of uses) {
      const result = await input.registry.run(use.name, use.input, input.context);
      input.onEvent?.({ type: 'tool', call: result.call });
      if (result.status === 'invalid_input') {
        const count = (invalidCount.get(use.name) ?? 0) + 1;
        invalidCount.set(use.name, count);
        if (count >= 2) throw new AgentTurnError(`Agent 回的${result.subject ?? use.name}格式不正確，請再試一次`);
      } else {
        toolCalls.push(result.call);
      }
      results.push({ type: 'tool_result', tool_use_id: use.id, content: result.content, ...(result.status === 'ok' ? {} : { is_error: true }) });
    }
    messages.push({ role: 'assistant', content: response.content }, { role: 'user', content: results });
  }
  throw new AgentTurnError('Agent 執行太多步驟，已停止，請再試一次');
}
