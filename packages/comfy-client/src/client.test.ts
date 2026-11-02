import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FAKE_API_KEY, FAKE_PNG, startFakeComfyMcp, type FakeComfyMcp } from '../../../tests/fakes/comfy-mcp/server.js';
import { createComfyClient, type ComfyClient } from './client.js';
import { ComfyAuthError } from './errors.js';
import { createMcpSession } from './rpc.js';

let fake: FakeComfyMcp;
let now = 0;

function client(options: { apiKey?: string; timeoutMs?: number } = {}): ComfyClient {
  const session = createMcpSession({ url: fake.url, apiKey: options.apiKey ?? FAKE_API_KEY });
  return createComfyClient({
    session,
    pollMs: 1000,
    timeoutMs: options.timeoutMs ?? 20 * 60 * 1000,
    now: () => now,
    // 假的時間：每次等待往前推，不真的睡
    sleep: async (ms) => {
      now += ms;
    },
  });
}

const call = (prompt: string) =>
  ({ tool: 'partner_generate', args: { type: 'image', model: 'vertexai/nano-banana-2-lite', prompt } }) as const;

beforeEach(async () => {
  now = 0;
  fake = await startFakeComfyMcp();
});

afterEach(async () => {
  await fake.close();
});

describe('MCP 連線', () => {
  it('第一次呼叫前 initialize，之後帶同一個 Mcp-Session-Id', async () => {
    const comfy = client();

    await comfy.submit(call('a'), { confirm: true });
    await comfy.submit(call('b'), { confirm: true });

    const methods = fake.calls.map((c) => c.method);
    expect(methods).toEqual(['initialize', 'notifications/initialized', 'tools/call', 'tools/call']);
    const sessionIds = new Set(fake.calls.map((c) => c.sessionId));
    expect(sessionIds.size).toBe(1);
  });

  it('session 過期（404）時重新初始化並重送一次', async () => {
    const comfy = client();
    await comfy.submit(call('a'), { confirm: true });
    fake.expireSessions();

    const result = await comfy.submit(call('b'), { confirm: true });

    expect(result.kind).toBe('submitted');
    expect(fake.calls.filter((c) => c.method === 'initialize')).toHaveLength(2);
    expect(fake.calls.filter((c) => c.method === 'tools/call' && c.args?.prompt === 'b')).toHaveLength(1);
  });

  it('金鑰錯誤時丟出 ComfyAuthError，訊息不含金鑰', async () => {
    const comfy = client({ apiKey: 'wrong-key' });

    const error = await comfy.submit(call('a'), { confirm: true }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ComfyAuthError);
    expect(String((error as Error).message)).not.toContain('wrong-key');
  });

  it('回應是 text/event-stream 時也能解析', async () => {
    fake.useEventStream(true);
    const comfy = client();

    expect((await comfy.submit(call('a'), { confirm: true })).kind).toBe('submitted');
  });
});

describe('送出與雲端確認', () => {
  it('沒有 confirm 時雲端要求確認，任務沒有建立', async () => {
    const comfy = client();

    const result = await comfy.submit(call('a'), { confirm: false });

    expect(result).toEqual({ kind: 'confirm_required', message: expect.stringContaining('confirm: true') });
    expect(fake.jobs.size).toBe(0);
    expect(fake.calls.find((c) => c.method === 'tools/call')?.args).not.toHaveProperty('confirm');
  });

  it('confirm 為 true 時帶 confirm: true 送出，拿到 prompt_id', async () => {
    const comfy = client();

    const result = await comfy.submit(call('a'), { confirm: true });

    expect(result.kind).toBe('submitted');
    expect(fake.calls.find((c) => c.method === 'tools/call')?.args?.confirm).toBe(true);
    expect(fake.jobs.has(result.kind === 'submitted' ? result.promptId : '')).toBe(true);
  });
});

describe('追蹤與取回', () => {
  async function submitted(comfy: ComfyClient, prompt: string): Promise<string> {
    const result = await comfy.submit(call(prompt), { confirm: true });
    if (result.kind !== 'submitted') throw new Error('沒有送出');
    return result.promptId;
  }

  it('輪詢到完成，取得短連結並下載', async () => {
    const comfy = client();
    const promptId = await submitted(comfy, '廟前全景');

    const result = await comfy.waitForJob(promptId, { startedAt: now });

    expect(result).toEqual({ kind: 'completed', urls: [`${fake.url.replace('/mcp', '')}/api/s/${promptId}`] });
    if (result.kind !== 'completed') return;
    const file = await comfy.download(result.urls[0] ?? '');
    expect(file.mime).toBe('image/png');
    expect(Buffer.from(file.bytes)).toEqual(FAKE_PNG);
    expect(fake.calls.filter((c) => c.tool === 'get_job_status').length).toBeGreaterThanOrEqual(2);
  });

  it('雲端回報失敗時回傳原因', async () => {
    const comfy = client();
    const promptId = await submitted(comfy, '這格會失敗 [fail]');

    expect(await comfy.waitForJob(promptId, { startedAt: now })).toEqual({
      kind: 'failed',
      message: '假的雲端錯誤：內容未通過審查',
    });
  });

  it('任務被取消時視為失敗', async () => {
    const comfy = client();
    const promptId = await submitted(comfy, '[cancel]');

    expect(await comfy.waitForJob(promptId, { startedAt: now })).toEqual({ kind: 'failed', message: '任務已取消' });
  });

  it('超過逾時時間還沒完成時回傳 timeout，不再查詢', async () => {
    const comfy = client({ timeoutMs: 5000 });
    const promptId = await submitted(comfy, '[never]');

    const result = await comfy.waitForJob(promptId, { startedAt: now });

    expect(result).toEqual({ kind: 'timeout' });
    expect(now).toBeGreaterThanOrEqual(5000);
    expect(fake.calls.filter((c) => c.tool === 'get_job_status').length).toBeLessThanOrEqual(7);
  });

  it('重啟後用同一個 prompt_id 繼續追蹤，不重新送出', async () => {
    const first = client();
    const promptId = await submitted(first, '重啟前送出的任務');

    // 模擬重啟：新的連線、新的 session
    const restarted = client();
    const result = await restarted.waitForJob(promptId, { startedAt: now });

    expect(result.kind).toBe('completed');
    expect(fake.calls.filter((c) => c.tool === 'partner_generate')).toHaveLength(1);
  });

  it('查狀態時任務不存在，視為失敗並帶回雲端的說明', async () => {
    const comfy = client();

    expect(await comfy.waitForJob('no-such-job', { startedAt: now })).toEqual({ kind: 'failed', message: '找不到這個任務' });
  });
});
