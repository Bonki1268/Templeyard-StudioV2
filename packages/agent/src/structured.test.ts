import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { StructuredOutputError, requestToolInput } from './structured.js';
import type { AgentBlock, ClaudeModel, ModelRequest, StopReason } from './types.js';

function scripted(responses: { content: AgentBlock[]; stopReason?: StopReason }[]) {
  const requests: ModelRequest[] = [];
  const model: ClaudeModel = {
    async create(request) {
      requests.push(structuredClone(request));
      const next = responses.shift();
      if (!next) throw new Error('假模型沒有更多回覆');
      return { content: next.content, stopReason: next.stopReason ?? 'tool_use', usage: { inputTokens: 10, outputTokens: 5 } };
    },
  };
  return { model, requests };
}

const tool = { name: 'submit_plan', description: '交出分鏡方案', schema: z.object({ shots: z.array(z.string()).min(1) }) };
const use = (id: string, input: unknown): AgentBlock => ({ type: 'tool_use', id, name: 'submit_plan', input });

function run(model: ClaudeModel) {
  return requestToolInput({ model, system: '分鏡系統指令', user: '想講的故事', tool, subject: '分鏡方案' });
}

describe('結構化輸出', () => {
  it('指定一定要用這個工具，送出由 Zod 轉出的 schema；回傳驗證過的輸入', async () => {
    const { model, requests } = scripted([{ content: [use('t1', { shots: ['遠景'] })] }]);

    const result = await run(model);

    expect(result).toEqual({ value: { shots: ['遠景'] }, usage: { inputTokens: 10, outputTokens: 5 } });
    expect(requests[0]).toMatchObject({
      system: '分鏡系統指令',
      messages: [{ role: 'user', content: '想講的故事' }],
      toolChoice: { type: 'tool', name: 'submit_plan' },
    });
    expect(requests[0]?.tools?.[0]).toMatchObject({ name: 'submit_plan', input_schema: { type: 'object', required: ['shots'] } });
  });

  it('格式不正確：把錯誤回給 Claude 修正一次，修正後回傳', async () => {
    const { model, requests } = scripted([{ content: [use('t1', { shots: [] })] }, { content: [use('t2', { shots: ['中景'] })] }]);

    const result = await run(model);

    expect(result.value).toEqual({ shots: ['中景'] });
    expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 10 });
    expect(requests[1]?.messages.at(-1)?.content).toEqual([expect.objectContaining({ type: 'tool_result', tool_use_id: 't1', is_error: true })]);
  });

  it('修正一次仍然不正確：說明格式不正確，不再要求', async () => {
    const { model, requests } = scripted([{ content: [use('t1', {})] }, { content: [use('t2', { shots: 'x' })] }, { content: [use('t3', { shots: ['a'] })] }]);

    await expect(run(model)).rejects.toThrow(new StructuredOutputError('Agent 回的分鏡方案格式不正確，請再試一次'));
    expect(requests).toHaveLength(2);
  });

  it('沒有用工具：當成格式不正確，要求修正', async () => {
    const { model } = scripted([{ content: [{ type: 'text', text: '我先想想' }], stopReason: 'end_turn' }, { content: [use('t2', { shots: ['a'] })] }]);
    expect((await run(model)).value).toEqual({ shots: ['a'] });
  });

  it.each([
    ['refusal', 'Claude 拒絕回覆這段內容，請修改後再試'],
    ['max_tokens', 'Agent 的回覆太長被截斷，請再試一次'],
  ] as const)('回應 %s 時停止並說明', async (stopReason, message) => {
    const { model } = scripted([{ content: [], stopReason }]);
    await expect(run(model)).rejects.toThrow(new StructuredOutputError(message));
  });
});
