import type { WrittenPrompt } from '@templeyard/shared';

// 假的第 1 段撰寫者（代替 Claude）：依序回傳事先準備好的結果，並記錄每次收到的請求
// 真的 Claude 撰寫在第 6 階段接上，到時另以錄製的回應測試

export type FakeWriterCall = { system: string; content: string; retryNote: string | undefined };

export function createFakeWriter(responses: WrittenPrompt[]) {
  const calls: FakeWriterCall[] = [];
  return {
    calls,
    write: async (
      request: { system: string; messages: { content: string }[] },
      options?: { retryNote?: string },
    ): Promise<WrittenPrompt> => {
      calls.push({ system: request.system, content: request.messages[0]?.content ?? '', retryNote: options?.retryNote });
      const next = responses[Math.min(calls.length - 1, responses.length - 1)];
      if (!next) throw new Error('假的撰寫者沒有準備回應');
      return next;
    },
  };
}
