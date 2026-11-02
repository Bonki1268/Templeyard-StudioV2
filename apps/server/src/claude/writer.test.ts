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
    expect(fake.requests).toEqual([{ model: 'model-from-env', system: '寺廟定裝版的視角圖：測試', user: '寺廟：板橋慈惠宮' }]);
  });

  it('重寫時把說明接在使用者內容後面', async () => {
    await writer().write(request('測試：照實回傳使用者內容', '原本的內容'), { retryNote: '缺少：grey granite dragon columns' });

    expect(fake.requests[0]?.user).toContain('原本的內容');
    expect(fake.requests[0]?.user).toContain('缺少：grey granite dragon columns');
  });

  it('回應包在 ```json 程式碼區塊裡也能解析', async () => {
    expect(await writer().write(request('測試：用程式碼區塊包起來', 'x'))).toEqual({ prompt: 'fenced prompt', notes: '包在程式碼區塊裡' });
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

  it('沒有 prompt 或 prompt 是空字串時不合法，錯誤訊息不含原文', () => {
    expect(() => parseWrittenPrompt('{"notes":"只有說明"}')).toThrow(ClaudeOutputError);
    expect(() => parseWrittenPrompt('{"prompt":""}')).toThrow(ClaudeOutputError);
    expect(() => parseWrittenPrompt('秘密的長文字')).toThrow(new ClaudeOutputError('Claude 回的最終指令格式不正確，請再試一次'));
  });
});
