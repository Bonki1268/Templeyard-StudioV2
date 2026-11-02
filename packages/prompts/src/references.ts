import type { McpCall, WorkflowModel } from '@templeyard/shared';

// 把參考圖（已上傳到雲端的參照）寫進 MCP 呼叫參數。
// 參考圖放在哪個參數是 07「下一輪測試」的待測事項：位置只來自 workflows 設定檔的 references，程式不猜。

/**
 * 回傳加上參考圖的新呼叫（不改動原本的 call）：
 * - 沒有參考圖時原樣回傳
 * - 模型沒有 references 設定時丟出 CallBuildError（說明參考圖輸入方式還沒實測）
 * - 超過 max 張時丟出 CallBuildError
 */
export function attachReferenceImages(_call: McpCall, _model: WorkflowModel, _refs: readonly string[]): McpCall {
  throw new Error('尚未實作');
}
