import { describe, expect, it } from 'vitest';
import { generationUnavailableMessage, readGenerationEnv, readTextEnv, textUnavailableMessage } from './env.js';

const complete = {
  COMFY_MCP_URL: 'http://127.0.0.1:3401/mcp',
  COMFY_CLOUD_API_KEY: 'comfy-key',
  ANTHROPIC_API_KEY: 'claude-key',
  CLAUDE_MODEL_ASSIST: 'model-from-env',
};

describe('生成相關的環境變數', () => {
  it('必填的都有時回傳設定；選填的用預設值', () => {
    expect(readGenerationEnv(complete)).toEqual({
      config: {
        comfy: { url: 'http://127.0.0.1:3401/mcp', apiKey: 'comfy-key', maxConcurrent: 1, pollMs: 4000 },
        claude: { apiKey: 'claude-key', model: 'model-from-env', baseURL: undefined },
      },
      missing: [],
    });
  });

  it('選填的同時執行數、輪詢間隔、Claude 的 baseURL', () => {
    const result = readGenerationEnv({
      ...complete,
      COMFY_MAX_CONCURRENT: '3',
      COMFY_POLL_MS: '200',
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:3501',
    });
    expect(result.config?.comfy).toMatchObject({ maxConcurrent: 3, pollMs: 200 });
    expect(result.config?.claude.baseURL).toBe('http://127.0.0.1:3501');
  });

  it('缺少或空白的必填變數只回傳名稱，不回傳任何值', () => {
    const result = readGenerationEnv({ COMFY_MCP_URL: ' ', COMFY_CLOUD_API_KEY: 'comfy-key' });
    expect(result).toEqual({ config: null, missing: ['COMFY_MCP_URL', 'ANTHROPIC_API_KEY', 'CLAUDE_MODEL_ASSIST'] });
    expect(JSON.stringify(result)).not.toContain('comfy-key');
  });

  it('數字不合法時當成缺少', () => {
    expect(readGenerationEnv({ ...complete, COMFY_MAX_CONCURRENT: '0' }).missing).toEqual(['COMFY_MAX_CONCURRENT']);
    expect(readGenerationEnv({ ...complete, COMFY_POLL_MS: 'abc' }).missing).toEqual(['COMFY_POLL_MS']);
  });

  it('生成服務沒有設定時的說明列出缺少的變數', () => {
    expect(generationUnavailableMessage(['COMFY_MCP_URL', 'ANTHROPIC_API_KEY'])).toBe(
      '還沒設定生成服務，不能生成：請在 .env.local 設定 COMFY_MCP_URL、ANTHROPIC_API_KEY',
    );
  });
});

describe('文字 AI 的環境變數', () => {
  const text = { ANTHROPIC_API_KEY: 'claude-key', CLAUDE_MODEL_AGENT: 'agent-model', CLAUDE_MODEL_ASSIST: 'assist-model' };

  it('只需要 Claude 的金鑰與兩個模型代號，不需要 Comfy Cloud', () => {
    expect(readTextEnv(text)).toEqual({
      config: { apiKey: 'claude-key', baseURL: undefined, agentModel: 'agent-model', assistModel: 'assist-model' },
      missing: [],
    });
  });

  it('選填的 baseURL（測試指向假的 Claude API）', () => {
    expect(readTextEnv({ ...text, ANTHROPIC_BASE_URL: 'http://127.0.0.1:3501' }).config?.baseURL).toBe('http://127.0.0.1:3501');
  });

  it('缺少或空白的必填變數只回傳名稱，不回傳任何值', () => {
    const result = readTextEnv({ ANTHROPIC_API_KEY: 'claude-key', CLAUDE_MODEL_AGENT: ' ' });
    expect(result).toEqual({ config: null, missing: ['CLAUDE_MODEL_AGENT', 'CLAUDE_MODEL_ASSIST'] });
    expect(JSON.stringify(result)).not.toContain('claude-key');
  });

  it('沒有設定時的說明列出缺少的名稱', () => {
    expect(textUnavailableMessage(['ANTHROPIC_API_KEY', 'CLAUDE_MODEL_AGENT'])).toBe(
      '還沒設定 Claude，不能使用創作對話與 AI 幫我寫：請在 .env.local 設定 ANTHROPIC_API_KEY、CLAUDE_MODEL_AGENT',
    );
  });
});
