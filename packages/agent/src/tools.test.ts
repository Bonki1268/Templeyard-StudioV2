import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { CONSENT_REQUIRED_RESULT, createToolRegistry, defineTool } from './tools.js';

const echo = defineTool({
  name: 'echo',
  label: '回聲',
  subject: '回聲',
  description: '把文字原樣回傳',
  inputSchema: z.object({ text: z.string().min(1) }),
  paid: false,
  run: async (input) => ({ ok: true, content: `回傳：${input.text}`, summary: `回傳 ${input.text.length} 字` }),
});

const paidRun = vi.fn(async () => ({ ok: true, content: '已送出', summary: '已送出生成' }));
const generateFrames = defineTool({
  name: 'generate_frames',
  label: '產生精緻圖',
  subject: '精緻圖',
  description: '付費：產生精緻圖',
  inputSchema: z.object({ shotKeys: z.array(z.string()) }),
  paid: true,
  run: paidRun,
});

const failing = defineTool({
  name: 'broken',
  label: '壞掉的工具',
  subject: '壞掉的工具',
  description: '一定失敗',
  inputSchema: z.object({}),
  paid: false,
  run: async () => {
    throw new Error('資料庫忙碌中');
  },
});

function registry(validToken = 'good-token') {
  return createToolRegistry([echo, generateFrames, failing], {
    verifyConsent: (token, toolName) => token === validToken && toolName === 'generate_frames',
  });
}

describe('工具清單', () => {
  it('送給 Claude 的清單有名稱、說明，輸入的 JSON Schema 由 Zod schema 轉出', () => {
    const specs = registry().specs();
    expect(specs.map((s) => s.name)).toEqual(['echo', 'generate_frames', 'broken']);
    expect(specs[0]).toMatchObject({
      description: '把文字原樣回傳',
      input_schema: { type: 'object', properties: { text: { type: 'string', minLength: 1 } }, required: ['text'] },
    });
  });
});

describe('執行工具', () => {
  it('輸入正確時執行，回傳結果與介面上的摘要', async () => {
    const result = await registry().run('echo', { text: '你好' }, { consentToken: null });
    expect(result).toEqual({
      status: 'ok',
      content: '回傳：你好',
      subject: '回聲',
      call: { name: 'echo', label: '回聲', ok: true, summary: '回傳 2 字' },
    });
  });

  it('輸入不符合 schema 時不執行，結果說明哪個欄位不對', async () => {
    const result = await registry().run('echo', { text: 1 }, { consentToken: null });
    expect(result.status).toBe('invalid_input');
    expect(result.content).toContain('text');
    expect(result.call).toMatchObject({ name: 'echo', ok: false });
  });

  it('沒有這個工具時回報，不會丟出例外', async () => {
    const result = await registry().run('delete_temple', {}, { consentToken: null });
    expect(result).toMatchObject({ status: 'unknown_tool', subject: null, call: { name: 'delete_temple', ok: false } });
    expect(result.content).toContain('delete_temple');
  });

  it('工具丟出例外時回報失敗，結果是錯誤訊息', async () => {
    const result = await registry().run('broken', {}, { consentToken: null });
    expect(result).toMatchObject({ status: 'failed', content: '資料庫忙碌中', call: { ok: false, summary: '資料庫忙碌中' } });
  });
});

describe('付費工具需要同意憑證', () => {
  it('沒有同意憑證時不執行，要求先取得同意', async () => {
    paidRun.mockClear();
    const result = await registry().run('generate_frames', { shotKeys: ['s1'] }, { consentToken: null });
    expect(result.status).toBe('consent_required');
    expect(result.content).toBe(CONSENT_REQUIRED_RESULT);
    expect(paidRun).not.toHaveBeenCalled();
  });

  it('憑證不通過檢查時不執行', async () => {
    paidRun.mockClear();
    const result = await registry().run('generate_frames', { shotKeys: ['s1'] }, { consentToken: 'forged' });
    expect(result.status).toBe('consent_required');
    expect(paidRun).not.toHaveBeenCalled();
  });

  it('憑證通過檢查才執行', async () => {
    paidRun.mockClear();
    const result = await registry().run('generate_frames', { shotKeys: ['s1'] }, { consentToken: 'good-token' });
    expect(result.status).toBe('ok');
    expect(paidRun).toHaveBeenCalledTimes(1);
  });

  it('不花錢的工具不檢查憑證', async () => {
    const verifyConsent = vi.fn(() => false);
    const result = await createToolRegistry([echo], { verifyConsent }).run('echo', { text: 'a' }, { consentToken: null });
    expect(result.status).toBe('ok');
    expect(verifyConsent).not.toHaveBeenCalled();
  });
});
