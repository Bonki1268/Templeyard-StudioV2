import type { ToolResult } from './rpc.js';

// 從 MCP 的工具回應找出需要的資訊（格式依 07 實測與 server.mjs）

/** 回應裡的 prompt_id；沒有時回傳 null */
export function findPromptId(_result: ToolResult): string | null {
  throw new Error('尚未實作');
}

export type JobState = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/** get_job_status 的狀態：job_status 優先於 result.status；completed／succeeded 為完成，error／failed 為失敗 */
export function jobState(_result: ToolResult): JobState {
  throw new Error('尚未實作');
}

/** 失敗原因：優先用雲端的說明，不顯示整個狀態物件；最多 500 字 */
export function failureMessage(_result: ToolResult): string {
  throw new Error('尚未實作');
}

/** 輸出連結：同一個結果有短連結（/api/s/）時只用短連結，否則取 storage 或 /api/view 的連結 */
export function findFileUrls(_result: ToolResult): string[] {
  throw new Error('尚未實作');
}

/** 雲端要求確認花費：沒有 prompt_id、也沒有檔案連結，文字提到 confirm */
export function isSpendConfirmation(_result: ToolResult): boolean {
  throw new Error('尚未實作');
}
