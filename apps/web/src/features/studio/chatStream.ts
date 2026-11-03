import { apiErrorSchema, chatEventSchema, createSseParser, type ChatEvent } from '@templeyard/shared';

// 讀取對話的 SSE 回應（fetch 的 body 是串流）：每收到一則完整的事件就交給 onEvent

/**
 * - 依序解析 SSE，data 用 chatEventSchema 驗證；格式不正確的事件略過
 * - 回應不是 2xx：讀出 JSON 的 message 丟出錯誤（沒有 message 時說明 HTTP 狀態）
 * - 沒有 body：丟出「Agent 沒有回應，請再試一次」
 */
export async function readChatStream(response: Response, onEvent: (event: ChatEvent) => void): Promise<void> {
  if (!response.ok) {
    let message = `Agent 回覆失敗（HTTP ${response.status}）`;
    try {
      const parsed = apiErrorSchema.safeParse(await response.json());
      if (parsed.success) message = parsed.data.message;
    } catch {
      // 不是 JSON：用 HTTP 狀態說明
    }
    throw new Error(message);
  }
  if (!response.body) throw new Error('Agent 沒有回應，請再試一次');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  const deliver = (text: string) => {
    for (const message of parser.push(text)) {
      try {
        const parsed = chatEventSchema.safeParse(JSON.parse(message.data));
        if (parsed.success) onEvent(parsed.data);
      } catch {
        // data 不是 JSON：略過這則事件
      }
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    deliver(decoder.decode(value, { stream: true }));
  }
  deliver(decoder.decode());
}
