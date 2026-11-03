import type { ChatEvent } from '@templeyard/shared';

// 讀取對話的 SSE 回應（fetch 的 body 是串流）：每收到一則完整的事件就交給 onEvent

/**
 * - 依序解析 SSE，data 用 chatEventSchema 驗證；格式不正確的事件略過
 * - 回應不是 2xx：讀出 JSON 的 message 丟出錯誤（沒有 message 時說明 HTTP 狀態）
 * - 沒有 body：丟出「Agent 沒有回應，請再試一次」
 */
export async function readChatStream(_response: Response, _onEvent: (event: ChatEvent) => void): Promise<void> {
  throw new Error('尚未實作');
}
