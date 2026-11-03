// Server-Sent Events 的格式與解析（對話回應以 SSE 串流；瀏覽器用 fetch 讀取，因為 EventSource 不能 POST）

export type SseMessage = { event: string; data: string };

/** 一則 SSE：`event: <名稱>`、`data: <JSON>`，以空行結束；資料以 JSON 編碼，所以只有一行 data */
export function formatSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * 逐段餵入收到的文字，回傳已經完整的事件；不完整的部分留到下一段。
 * 多行 data 以換行接回；以「:」開頭的註解行略過；沒有 event 時名稱是 message。
 */
export function createSseParser(): { push(chunk: string): SseMessage[] } {
  let buffer = '';
  return {
    push(chunk) {
      buffer += chunk.replace(/\r\n?/g, '\n');
      const messages: SseMessage[] = [];
      let end = buffer.indexOf('\n\n');
      while (end !== -1) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        let event = 'message';
        const data: string[] = [];
        for (const line of block.split('\n')) {
          if (line.startsWith(':')) continue;
          const colon = line.indexOf(':');
          const field = colon === -1 ? line : line.slice(0, colon);
          const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
          if (field === 'event') event = value;
          else if (field === 'data') data.push(value);
        }
        if (data.length > 0) messages.push({ event, data: data.join('\n') });
        end = buffer.indexOf('\n\n');
      }
      return messages;
    },
  };
}
