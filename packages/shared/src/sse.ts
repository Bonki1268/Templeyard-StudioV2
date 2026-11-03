// Server-Sent Events 的格式與解析（對話回應以 SSE 串流；瀏覽器用 fetch 讀取，因為 EventSource 不能 POST）

export type SseMessage = { event: string; data: string };

/** 一則 SSE：`event: <名稱>`、`data: <JSON>`，以空行結束；資料以 JSON 編碼，所以只有一行 data */
export function formatSseEvent(_event: string, _data: unknown): string {
  throw new Error('尚未實作');
}

/**
 * 逐段餵入收到的文字，回傳已經完整的事件；不完整的部分留到下一段。
 * 多行 data 以換行接回；以「:」開頭的註解行略過；沒有 event 時名稱是 message。
 */
export function createSseParser(): { push(chunk: string): SseMessage[] } {
  throw new Error('尚未實作');
}
