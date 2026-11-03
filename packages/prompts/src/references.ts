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
    node[path.at(-1) ?? ''] = valueFor(slot, refs);
  }
  return { tool: call.tool, args };
}

/** 依格式組出寫進參數的值（07 實測，2026-11-03） */
function valueFor(slot: NonNullable<WorkflowModel['references']>, refs: readonly string[]): unknown {
  switch (slot.format ?? 'list') {
    case 'single':
      return refs[0];
    case 'medias':
      // 雲端參照是「subfolder/name」或「name」
      return refs.map((ref) => {
        const index = ref.lastIndexOf('/');
        return { role: slot.role ?? 'reference_image', name: index >= 0 ? ref.slice(index + 1) : ref, subfolder: index >= 0 ? ref.slice(0, index) : '', type: 'input' };
      });
    default:
      return [...refs];
  }
}
