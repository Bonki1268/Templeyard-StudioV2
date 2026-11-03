import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { FAKE_CLAUDE_API_KEY, startFakeClaude, type FakeClaude } from '../../../tests/fakes/claude/server.js';
import { createClaudeModel } from './claude.js';
import { runAgentTurn } from './loop.js';
import { createToolRegistry, defineTool } from './tools.js';
import { ClaudeCallError } from './types.js';

// 以錄製的回應（tests/fakes/claude/recordings.json）測試 SDK 轉接與工具流程；不會連到真的 Claude API

let fake: FakeClaude;

beforeAll(async () => {
  fake = await startFakeClaude();
});

afterAll(async () => {
  await fake.close();
});

const echoed: string[] = [];
const echo = defineTool({
  name: 'echo',
  label: '回聲',
  subject: '回聲',
  description: '把文字原樣回傳',
  inputSchema: z.object({ text: z.string() }),
  paid: false,
  run: async (input) => {
    echoed.push(input.text);
    return { ok: true, content: `回傳：${input.text}`, summary: '已回傳' };
  },
});

describe('Claude API 轉接', () => {
  it('送出模型代號、系統指令、訊息與工具，轉成內容區塊、停止原因與用量', async () => {
    const model = createClaudeModel({ apiKey: FAKE_CLAUDE_API_KEY, model: 'model-from-env', baseURL: fake.url });

    const response = await model.create({
      system: '測試 Agent：轉接',
      messages: [{ role: 'user', content: '你好' }],
      tools: [{ name: 'echo', description: '回聲', input_schema: { type: 'object', properties: { text: { type: 'string' } } } }],
    });

    expect(response.stopReason).toBe('tool_use');
    expect(response.content).toEqual([
      { type: 'text', text: '我先查一下。' },
      { type: 'tool_use', id: expect.stringMatching(/^toolu_test_/), name: 'echo', input: { text: '你好' } },
    ]);
    expect(response.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
    expect(fake.requests.at(-1)).toMatchObject({ model: 'model-from-env', system: '測試 Agent：轉接', tools: ['echo'] });
  });

  it('金鑰不正確時說明要檢查 ANTHROPIC_API_KEY，訊息不含金鑰', async () => {
    const model = createClaudeModel({ apiKey: 'wrong-key', model: 'm', baseURL: fake.url });
    const error = await model.create({ system: '測試 Agent', messages: [{ role: 'user', content: 'hi' }] }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ClaudeCallError);
    expect((error as Error).message).toBe('Claude API 的金鑰不正確，請檢查 ANTHROPIC_API_KEY');
  });

  it('沒有符合的回應（HTTP 500）時說明狀態碼', async () => {
    const model = createClaudeModel({ apiKey: FAKE_CLAUDE_API_KEY, model: 'm', baseURL: fake.url });
    const error = await model.create({ system: '沒有錄製的系統指令', messages: [{ role: 'user', content: 'hi' }] }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ClaudeCallError);
    expect((error as Error).message).toBe('Claude API 回應錯誤（HTTP 500）');
  }, 30_000);

  it('連不上時說明要確認網路', async () => {
    const model = createClaudeModel({ apiKey: FAKE_CLAUDE_API_KEY, model: 'm', baseURL: 'http://127.0.0.1:9' });
    const error = await model.create({ system: '測試 Agent', messages: [{ role: 'user', content: 'hi' }] }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ClaudeCallError);
    expect((error as Error).message).toBe('連不上 Claude API，請確認網路');
  }, 30_000);
});

describe('以錄製的回應跑完一輪工具流程', () => {
  it('Claude 呼叫工具 → 執行 → 回傳結果 → Claude 結束這一輪', async () => {
    echoed.length = 0;
    const model = createClaudeModel({ apiKey: FAKE_CLAUDE_API_KEY, model: 'm', baseURL: fake.url });
    const before = fake.requests.length;

    const result = await runAgentTurn({
      model,
      system: '測試 Agent：工具流程',
      history: [],
      userMessage: '查一下板橋慈惠宮',
      registry: createToolRegistry([echo], { verifyConsent: () => false }),
      context: { consentToken: null },
    });

    expect(echoed).toEqual(['查一下板橋慈惠宮']);
    expect(result.text).toBe('我先查一下。\n\n查好了。');
    expect(result.toolCalls).toEqual([{ name: 'echo', label: '回聲', ok: true, summary: '已回傳' }]);
    const sent = fake.requests.slice(before);
    expect(sent).toHaveLength(2);
    expect(sent[1]?.user).toContain('回傳：查一下板橋慈惠宮');
  });
});

describe('指定工具', () => {
  it('toolChoice 轉成 tool_choice 送出', async () => {
    const model = createClaudeModel({ apiKey: FAKE_CLAUDE_API_KEY, model: 'm', baseURL: fake.url });
    await model.create({
      system: '測試 Agent：指定工具',
      messages: [{ role: 'user', content: '你好' }],
      tools: [{ name: 'echo', description: '回聲', input_schema: { type: 'object', properties: {} } }],
      toolChoice: { type: 'tool', name: 'echo' },
    });
    expect(fake.requests.at(-1)?.toolChoice).toEqual({ type: 'tool', name: 'echo' });
  });
});
