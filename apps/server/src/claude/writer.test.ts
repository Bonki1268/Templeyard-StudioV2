import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FAKE_CLAUDE_API_KEY, startFakeClaude, type FakeClaude } from '../../../../tests/fakes/claude/server.js';
import { ClaudeOutputError, createClaudePromptWriter, parseWrittenPrompt } from './writer.js';

let fake: FakeClaude;

beforeEach(async () => {
  fake = await startFakeClaude();
});

afterEach(async () => {
  await fake.close();
});

function writer(apiKey = FAKE_CLAUDE_API_KEY) {
  return createClaudePromptWriter({ apiKey, model: 'model-from-env', baseURL: fake.url });
}

const request = (system: string, content: string) => ({
  promptId: 'temple-view',
  promptVersion: 2,
  step: 2,
  target: { kind: 'image' as const, model: 'nano-banana-pro', aspectRatio: '16:9' },
  system,
  messages: [{ role: 'user' as const, content }],
});

describe('Claude 撰寫者', () => {
  it('送出節點指令與帶入資料後的內容，用環境變數的模型，解析出最終指令', async () => {
    const written = await writer().write(request('寺廟定裝版的視角圖：測試', '寺廟：板橋慈惠宮'));

    expect(written.prompt).toContain('寺廟：板橋慈惠宮');
    // 用工具強制 Claude 回固定格式（2026-11-03 實測：真的 Claude 會在 JSON 前後加說明文字）
    expect(fake.requests).toEqual([
      {
        model: 'model-from-env',
        system: '寺廟定裝版的視角圖：測試',
        user: '寺廟：板橋慈惠宮',
        tools: ['submit_final_prompt'],
        toolChoice: { type: 'tool', name: 'submit_final_prompt' },
      },
    ]);
  });

  it('重寫時把說明接在使用者內容後面', async () => {
    await writer().write(request('測試：照實回傳使用者內容', '原本的內容'), { retryNote: '缺少：grey granite dragon columns' });

    expect(fake.requests[0]?.user).toContain('原本的內容');
    expect(fake.requests[0]?.user).toContain('缺少：grey granite dragon columns');
  });

  it('回應包在 ```json 程式碼區塊裡也能解析', async () => {
    expect(await writer().write(request('測試：用程式碼區塊包起來', 'x'))).toEqual({ prompt: 'fenced prompt', notes: '包在程式碼區塊裡' });
  });

  it('Claude 用工具回傳時，取工具的輸入當最終指令', async () => {
    expect(await writer().write(request('測試：用工具回傳最終指令', 'x'))).toEqual({ prompt: 'tool prompt', notes: '用工具回傳' });
  });

  it('模型不接受工具呼叫（HTTP 400）時，改用一般文字再送一次（2026-11-03 實測）', async () => {
    expect(await writer().write(request('測試：模型不接受工具', 'x'))).toEqual({ prompt: 'plain prompt', notes: '改用文字回傳' });
    expect(fake.requests).toHaveLength(2);
    expect(fake.requests[0]?.toolChoice).toEqual({ type: 'tool', name: 'submit_final_prompt' });
    expect(fake.requests[1]).not.toHaveProperty('toolChoice');
    expect(fake.requests[1]).not.toHaveProperty('tools');
    // 改用文字時，系統指令最後明確要求只回 JSON（節點指令本身沒有寫輸出格式）
    expect(fake.requests[1]?.system).toContain('測試：模型不接受工具');
    expect(fake.requests[1]?.system).toContain('只回一個 JSON 物件，不要任何其他文字：{"prompt": "直接送給生成模型的最終指令", "notes": "給使用者看的說明"}');
  });

  it('Claude API 回錯誤時，訊息附上 Claude 說的原因（不含金鑰）', async () => {
    const error = await writer()
      .write(request('沒有對應的錄製回應', 'x'))
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect((error as Error).message).toBe('Claude API 回應錯誤（HTTP 500）：假的 Claude 沒有符合的錄製回應');
  });

  it('工具的輸入不合法（沒有 prompt）時丟出 ClaudeOutputError', async () => {
    await expect(writer().write(request('測試：工具輸入不合法', 'x'))).rejects.toBeInstanceOf(ClaudeOutputError);
  });

  it('回應不是合法的最終指令時丟出 ClaudeOutputError', async () => {
    await expect(writer().write(request('測試：回傳不合法的內容', 'x'))).rejects.toBeInstanceOf(ClaudeOutputError);
  });

  it('金鑰錯誤時丟出錯誤，訊息不含金鑰', async () => {
    const error = await writer('wrong-key-123')
      .write(request('寺廟定裝版的視角圖', 'x'))
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(Error);
    expect(String((error as Error).message)).not.toContain('wrong-key-123');
  });
});

describe('解析 Claude 回的文字', () => {
  it('合法的 JSON', () => {
    expect(parseWrittenPrompt(' {"prompt":"p","notes":"n"} ')).toEqual({ prompt: 'p', notes: 'n' });
  });

  it('JSON 前後有說明文字也能解析（2026-11-03 實測）', () => {
    expect(parseWrittenPrompt('這是最終指令：\n```json\n{"prompt":"p","notes":"n"}\n```\n希望有幫助')).toEqual({ prompt: 'p', notes: 'n' });
    expect(parseWrittenPrompt('好的，以下是結果 {"prompt":"p"} 請參考')).toEqual({ prompt: 'p' });
  });

  it('沒有 prompt 或 prompt 是空字串時不合法，錯誤訊息不含原文', () => {
    expect(() => parseWrittenPrompt('{"notes":"只有說明"}')).toThrow(ClaudeOutputError);
    expect(() => parseWrittenPrompt('{"prompt":""}')).toThrow(ClaudeOutputError);
    expect(() => parseWrittenPrompt('秘密的長文字')).toThrow(new ClaudeOutputError('Claude 回的最終指令格式不正確，請再試一次'));
  });
});
