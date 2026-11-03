import type { McpCall, WorkflowModel } from '@templeyard/shared';
import { CallBuildError } from './bindings.js';

// 把參考圖（已上傳到雲端的參照）寫進 MCP 呼叫參數。
// 參考圖放在哪個參數是 07「下一輪測試」的待測事項：位置只來自 workflows 設定檔的 references，程式不猜。

/**
 * 回傳加上參考圖的新呼叫（不改動原本的 call）：
 * - 沒有參考圖時原樣回傳
 * - 模型沒有 references 設定時丟出 CallBuildError（說明參考圖輸入方式還沒實測）
 * - 超過 max 張時丟出 CallBuildError
 */
export function attachReferenceImages(call: McpCall, model: WorkflowModel, refs: readonly string[]): McpCall {
  if (refs.length === 0) return call;
  const slot = model.references;
  if (!slot) throw new CallBuildError(`${model.label} 的參考圖輸入方式還沒實測（07「下一輪測試」），不能用照片生成`);
  if (refs.length > slot.max) throw new CallBuildError(`${model.label}最多只能用 ${slot.max} 張參考圖`);
  const args = structuredClone(call.args);
  for (const path of slot.paths) {
    let node = args;
    for (const key of path.slice(0, -1)) {
      const next = node[key];
      if (typeof next !== 'object' || next === null || Array.isArray(next)) node[key] = {};
      node = node[key] as Record<string, unknown>;
    }
    node[path.at(-1) ?? ''] = [...refs];
  }
  return { tool: call.tool, args };
}
