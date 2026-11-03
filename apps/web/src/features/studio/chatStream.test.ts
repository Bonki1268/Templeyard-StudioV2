import type { ChatEvent } from '@templeyard/shared';
import { describe, expect, it } from 'vitest';
import { readChatStream } from './chatStream';

const message = { id: 'm1', videoId: 'v1', role: 'agent' as const, content: '好的', toolCalls: [], createdAt: '2026-11-03T09:00:00.000Z' };

/** 把文字切成幾段送出的串流回應 */
function streamed(chunks: string[], init: ResponseInit = { status: 200 }) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' }, ...init });
}

const sse = (event: ChatEvent) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

describe('讀取對話的串流回應', () => {
  it('依序交出每一則事件，事件被切在兩段之間也沒關係', async () => {
    const text = sse({ type: 'text', text: '好的' }) + sse({ type: 'done', message });
    const received: ChatEvent[] = [];

    await readChatStream(streamed([text.slice(0, 15), text.slice(15, 40), text.slice(40)]), (e) => received.push(e));

    expect(received).toEqual([
      { type: 'text', text: '好的' },
      { type: 'done', message },
    ]);
  });

  it('中文字被切在兩段之間也能正確解碼', async () => {
    const bytes = new TextEncoder().encode(sse({ type: 'text', text: '媽祖' }));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 40));
        controller.enqueue(bytes.slice(40));
        controller.close();
      },
    });
    const received: ChatEvent[] = [];

    await readChatStream(new Response(body), (e) => received.push(e));

    expect(received).toEqual([{ type: 'text', text: '媽祖' }]);
  });

  it('格式不正確的事件略過', async () => {
    const received: ChatEvent[] = [];
    await readChatStream(streamed(['event: text\ndata: {"type":"text"}\n\n', sse({ type: 'error', message: '失敗' })]), (e) => received.push(e));
    expect(received).toEqual([{ type: 'error', message: '失敗' }]);
  });

  it('回應不是 2xx：丟出後端的說明', async () => {
    const response = new Response(JSON.stringify({ message: '寺廟定裝版還沒確認，還不能開始創作' }), { status: 409 });
    await expect(readChatStream(response, () => undefined)).rejects.toThrow('寺廟定裝版還沒確認，還不能開始創作');
  });

  it('回應不是 2xx 也沒有說明：寫出 HTTP 狀態', async () => {
    await expect(readChatStream(new Response('oops', { status: 500 }), () => undefined)).rejects.toThrow('HTTP 500');
  });

  it('沒有內容：說明 Agent 沒有回應', async () => {
    await expect(readChatStream(new Response(null, { status: 200 }), () => undefined)).rejects.toThrow('Agent 沒有回應，請再試一次');
  });
});
