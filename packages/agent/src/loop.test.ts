import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AgentTurnError, runAgentTurn, type AgentTurnEvent } from './loop.js';
import { createToolRegistry, defineTool } from './tools.js';
import type { AgentBlock, ClaudeModel, ModelRequest, ModelResponse, StopReason } from './types.js';

// 依序回覆的假模型：記下每次收到的請求（深拷貝，之後被改動也看得出來）
function scripted(responses: { content: AgentBlock[]; stopReason?: StopReason }[]) {
  const requests: ModelRequest[] = [];
  const model: ClaudeModel = {
    async create(request) {
      requests.push(structuredClone(request));
      const next = responses.shift();
      if (!next) throw new Error('假模型沒有更多回覆');
      const usesTool = next.content.some((b) => b.type === 'tool_use');
      const response: ModelResponse = {
        content: next.content,
        stopReason: next.stopReason ?? (usesTool ? 'tool_use' : 'end_turn'),
        usage: { inputTokens: 10, outputTokens: 5 },
      };
      return response;
    },
  };
  return { model, requests };
}

const opened: string[] = [];
const questionnaireTool = defineTool({
  name: 'generate_questionnaire',
  label: '開啟問卷',
  subject: '問卷',
  description: '開啟問卷',
  inputSchema: z.object({ questionIds: z.array(z.enum(['story', 'tone'])).min(1) }),
  paid: false,
  run: async (input) => {
    opened.push(input.questionIds.join(','));
    return { ok: true, content: '問卷已開啟', summary: `${input.questionIds.length} 題` };
  },
});

const registry = createToolRegistry([questionnaireTool], { verifyConsent: () => false });

function turn(model: ClaudeModel, events: AgentTurnEvent[] = []) {
  return runAgentTurn({
    model,
    system: '測試用的系統指令',
    history: [
      { role: 'user', content: '上一句' },
      { role: 'assistant', content: '上一個回覆' },
    ],
    userMessage: '講媽祖的故事',
    registry,
    context: { consentToken: null },
    onEvent: (event) => events.push(event),
  });
}

describe('Agent 的一輪對話', () => {
  it('沒有用工具：送出系統指令、之前的對話與這一句、工具清單，回傳 Agent 說的話', async () => {
    const { model, requests } = scripted([{ content: [{ type: 'text', text: '好的。' }] }]);
    const events: AgentTurnEvent[] = [];

    const result = await turn(model, events);

    expect(result).toEqual({ text: '好的。', toolCalls: [], usage: { inputTokens: 10, outputTokens: 5 } });
    expect(events).toEqual([{ type: 'text', text: '好的。' }]);
    expect(requests[0]).toMatchObject({
      system: '測試用的系統指令',
      messages: [
        { role: 'user', content: '上一句' },
        { role: 'assistant', content: '上一個回覆' },
        { role: 'user', content: '講媽祖的故事' },
      ],
    });
    expect(requests[0]?.tools?.map((t) => t.name)).toEqual(['generate_questionnaire']);
  });

  it('Claude 要用工具：執行後把結果回給 Claude，直到這一輪結束；文字與工具結果依序送出', async () => {
    opened.length = 0;
    const { model, requests } = scripted([
      {
        content: [
          { type: 'text', text: '我先開問卷。' },
          { type: 'tool_use', id: 'toolu_1', name: 'generate_questionnaire', input: { questionIds: ['story', 'tone'] } },
        ],
      },
      { content: [{ type: 'text', text: '問卷開好了。' }] },
    ]);
    const events: AgentTurnEvent[] = [];

    const result = await turn(model, events);

    expect(opened).toEqual(['story,tone']);
    expect(result.text).toBe('我先開問卷。\n\n問卷開好了。');
    expect(result.toolCalls).toEqual([{ name: 'generate_questionnaire', label: '開啟問卷', ok: true, summary: '2 題' }]);
    expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 10 });
    expect(events.map((e) => e.type)).toEqual(['text', 'tool', 'text']);
    // 第二次請求帶上 Claude 的工具呼叫與工具結果
    expect(requests[1]?.messages.slice(-2)).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: '我先開問卷。' },
          { type: 'tool_use', id: 'toolu_1', name: 'generate_questionnaire', input: { questionIds: ['story', 'tone'] } },
        ],
      },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '問卷已開啟' }] },
    ]);
  });

  it('工具輸入格式不正確：把錯誤回給 Claude 修正一次，修正後繼續', async () => {
    opened.length = 0;
    const { model, requests } = scripted([
      { content: [{ type: 'tool_use', id: 'toolu_1', name: 'generate_questionnaire', input: { questionIds: ['bad'] } }] },
      { content: [{ type: 'tool_use', id: 'toolu_2', name: 'generate_questionnaire', input: { questionIds: ['story'] } }] },
      { content: [{ type: 'text', text: '好了。' }] },
    ]);

    const result = await turn(model);

    expect(opened).toEqual(['story']);
    expect(result.text).toBe('好了。');
    const retry = requests[1]?.messages.at(-1);
    expect(retry?.content).toEqual([expect.objectContaining({ type: 'tool_result', tool_use_id: 'toolu_1', is_error: true })]);
  });

  it('同一個工具修正一次仍然格式不正確：停止並說明', async () => {
    const bad = (id: string): AgentBlock => ({ type: 'tool_use', id, name: 'generate_questionnaire', input: { questionIds: [] } });
    const { model, requests } = scripted([{ content: [bad('toolu_1')] }, { content: [bad('toolu_2')] }, { content: [{ type: 'text', text: '不該到這裡' }] }]);

    await expect(turn(model)).rejects.toThrow(new AgentTurnError('Agent 回的問卷格式不正確，請再試一次'));
    expect(requests).toHaveLength(2);
  });

  it('沒有這個工具：結果告訴 Claude，這一輪繼續', async () => {
    const { model, requests } = scripted([
      { content: [{ type: 'tool_use', id: 'toolu_1', name: 'delete_temple', input: {} }] },
      { content: [{ type: 'text', text: '我沒有這個工具。' }] },
    ]);

    const result = await turn(model);

    expect(result.text).toBe('我沒有這個工具。');
    expect(requests[1]?.messages.at(-1)?.content).toEqual([expect.objectContaining({ tool_use_id: 'toolu_1', is_error: true })]);
  });

  it.each([
    ['refusal', 'Claude 拒絕回覆這段對話，請換個說法再試'],
    ['max_tokens', 'Agent 的回覆太長被截斷，請再試一次'],
  ] as const)('回應 %s 時停止並說明', async (stopReason, message) => {
    const { model } = scripted([{ content: [{ type: 'text', text: '…' }], stopReason }]);
    await expect(turn(model)).rejects.toThrow(new AgentTurnError(message));
  });

  it('一直要用工具、超過步數上限時停止', async () => {
    const loop = Array.from({ length: 3 }, (_, i) => ({
      content: [{ type: 'tool_use', id: `toolu_${i}`, name: 'generate_questionnaire', input: { questionIds: ['story'] } } as AgentBlock],
    }));
    const { model } = scripted(loop);

    await expect(
      runAgentTurn({ model, system: 's', history: [], userMessage: 'u', registry, context: { consentToken: null }, maxSteps: 2 }),
    ).rejects.toThrow(new AgentTurnError('Agent 執行太多步驟，已停止，請再試一次'));
  });
});
