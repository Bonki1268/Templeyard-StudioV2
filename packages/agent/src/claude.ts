import Anthropic from '@anthropic-ai/sdk';
import { ClaudeCallError, type AgentBlock, type AgentMessage, type ClaudeModel, type ModelRequest, type StopReason } from './types.js';

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

/** 停止原因轉成 types.ts 的值；不認得的歸為 other */
function stopReasonOf(reason: string | null): StopReason {
  const known: readonly StopReason[] = ['end_turn', 'tool_use', 'max_tokens', 'refusal', 'stop_sequence', 'pause_turn'];
  return known.find((value) => value === reason) ?? 'other';
}

function toSdkContent(content: AgentMessage['content']): Anthropic.MessageParam['content'] {
  if (typeof content === 'string') return content;
  return content.map((block): Anthropic.ContentBlockParam => {
    if (block.type === 'text') return { type: 'text', text: block.text };
    if (block.type === 'tool_use') return { type: 'tool_use', id: block.id, name: block.name, input: block.input };
    return { type: 'tool_result', tool_use_id: block.tool_use_id, content: block.content, ...(block.is_error ? { is_error: true } : {}) };
  });
}

function fromSdkContent(content: readonly Anthropic.ContentBlock[]): AgentBlock[] {
  const blocks: AgentBlock[] = [];
  for (const block of content) {
    if (block.type === 'text') blocks.push({ type: 'text', text: block.text });
    else if (block.type === 'tool_use') blocks.push({ type: 'tool_use', id: block.id, name: block.name, input: block.input });
  }
  return blocks;
}

/**
 * 錯誤一律轉成 ClaudeCallError：
 * - 金鑰不正確：「Claude API 的金鑰不正確，請檢查 ANTHROPIC_API_KEY」
 * - 其他 HTTP 錯誤：「Claude API 回應錯誤（HTTP 500）」
 * - 連不上：「連不上 Claude API，請確認網路」
 */
export function createClaudeModel(options: ClaudeModelOptions): ClaudeModel {
  const client = new Anthropic({ apiKey: options.apiKey, ...(options.baseURL ? { baseURL: options.baseURL } : {}) });
  return {
    async create(request) {
      let response: Anthropic.Message;
      const send = (toolChoice: ModelRequest['toolChoice'] | { type: 'auto' }) =>
        client.messages.create({
          model: options.model,
          max_tokens: request.maxTokens ?? options.maxTokens ?? 4096,
          system: request.system,
          messages: request.messages.map((message) => ({ role: message.role, content: toSdkContent(message.content) })),
          ...(request.tools && request.tools.length > 0
            ? {
                tools: request.tools.map((tool) => ({
                  name: tool.name,
                  description: tool.description,
                  input_schema: tool.input_schema as Anthropic.Tool['input_schema'],
                })),
              }
            : {}),
          ...(toolChoice ? { tool_choice: toolChoice } : {}),
        });
      try {
        try {
          response = await send(request.toolChoice);
        } catch (error: unknown) {
          // 有的模型不接受指定工具（2026-11-03 實測 HTTP 400）：改成可以用工具（auto）再送一次；
          // 呼叫的一方（例如 requestToolInput）沒拿到工具時會再要求一次
          const forced = request.toolChoice !== undefined;
          if (!(error instanceof Anthropic.BadRequestError) || !forced) throw error;
          response = await send({ type: 'auto' });
        }
      } catch (error: unknown) {
        if (error instanceof Anthropic.AuthenticationError) throw new ClaudeCallError('Claude API 的金鑰不正確，請檢查 ANTHROPIC_API_KEY');
        if (error instanceof Anthropic.APIConnectionError) throw new ClaudeCallError('連不上 Claude API，請確認網路');
        if (error instanceof Anthropic.APIError) {
          // 附上 Claude 說的原因（不含金鑰），方便判斷是模型代號、參數還是額度的問題
          const body = error.error as { error?: { message?: unknown } } | undefined;
          const reason = typeof body?.error?.message === 'string' ? body.error.message.split(options.apiKey).join('[金鑰]').slice(0, 300) : '';
          throw new ClaudeCallError(`Claude API 回應錯誤（HTTP ${error.status ?? '連線失敗'}）${reason ? `：${reason}` : ''}`);
        }
        throw new ClaudeCallError('連不上 Claude API，請確認網路');
      }
      return {
        content: fromSdkContent(response.content),
        stopReason: stopReasonOf(response.stop_reason),
        usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
      };
    },
  };
}
