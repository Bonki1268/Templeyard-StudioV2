import { z } from 'zod';
import type { AgentMessage, ClaudeModel, ToolUseBlock, Usage } from './types.js';

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
export async function requestToolInput<T>(request: StructuredRequest<T>): Promise<{ value: T; usage: Usage }> {
  const { $schema: _schema, ...inputSchema } = z.toJSONSchema(request.tool.schema, { io: 'input' }) as Record<string, unknown>;
  const tools = [{ name: request.tool.name, description: request.tool.description, input_schema: inputSchema }];
  const messages: AgentMessage[] = [{ role: 'user', content: request.user }];
  const usage = { inputTokens: 0, outputTokens: 0 };
  const formatError = `Agent 回的${request.subject}格式不正確，請再試一次`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await request.model.create({
      system: request.system,
      messages,
      tools,
      toolChoice: { type: 'tool', name: request.tool.name },
      ...(request.maxTokens ? { maxTokens: request.maxTokens } : {}),
    });
    usage.inputTokens += response.usage.inputTokens;
    usage.outputTokens += response.usage.outputTokens;
    if (response.stopReason === 'refusal') throw new StructuredOutputError('Claude 拒絕回覆這段內容，請修改後再試');
    if (response.stopReason === 'max_tokens') throw new StructuredOutputError('Agent 的回覆太長被截斷，請再試一次');

    const use = response.content.find((block): block is ToolUseBlock => block.type === 'tool_use' && block.name === request.tool.name);
    const parsed = use ? request.tool.schema.safeParse(use.input) : null;
    if (parsed?.success) return { value: parsed.data, usage };

    // 修正一次：說明哪裡不對
    const problem = parsed ? parsed.error.issues.map((issue) => `${issue.path.join('.') || '(整個輸入)'}：${issue.message}`).join('；') : `請用 ${request.tool.name} 工具回覆`;
    if (use) {
      messages.push(
        { role: 'assistant', content: response.content },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: use.id, content: `格式不正確：${problem}。請修正後再呼叫一次`, is_error: true }] },
      );
    } else {
      messages.push({ role: 'assistant', content: response.content.length > 0 ? response.content : '（沒有回覆）' }, { role: 'user', content: problem });
    }
  }
  throw new StructuredOutputError(formatError);
}
