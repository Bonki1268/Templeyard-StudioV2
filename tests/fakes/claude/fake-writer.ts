import type { WrittenPrompt } from '@templeyard/shared';

// 假的第 1 段撰寫者（代替 Claude）：記錄每次收到的請求。
// responses 是陣列時依序回傳事先準備好的結果；是函式時依請求產生（例如把收到的內容接在最終指令後面）。
// 真的 Claude 撰寫者另以假的 Claude API（tests/fakes/claude/server.ts）測試。

export type FakeWriterCall = { system: string; content: string; retryNote: string | undefined };

export function createFakeWriter(responses: WrittenPrompt[] | ((call: FakeWriterCall) => WrittenPrompt)) {
  const calls: FakeWriterCall[] = [];
  return {
    calls,
    write: async (
      request: { system: string; messages: { content: string }[] },
      options?: { retryNote?: string },
    ): Promise<WrittenPrompt> => {
      const call = { system: request.system, content: request.messages[0]?.content ?? '', retryNote: options?.retryNote };
      calls.push(call);
      if (typeof responses === 'function') return responses(call);
      const next = responses[Math.min(calls.length - 1, responses.length - 1)];
      if (!next) throw new Error('假的撰寫者沒有準備回應');
      return next;
    },
  };
}

/** 把收到的內容原樣接在最終指令後面：連續性鎖與修改指令都會出現在送給雲端的指令裡 */
export const echoWriterResponse = (call: FakeWriterCall): WrittenPrompt => ({
  prompt: `Final temple view prompt. ${call.content}`,
  notes: '假的撰寫者',
});
