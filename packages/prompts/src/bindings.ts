import type { McpCall, PromptBindings, PromptFile, WorkflowConfig, WorkflowModel } from '@templeyard/shared';

// 呼叫綁定：哪個資料寫進 MCP 呼叫的哪個參數（02「生成指令組裝」）

/** 綁定來源除了變數之外，可以用的特殊名稱 */
export const SPECIAL_BINDING_SOURCES = ['output.prompt', 'target.aspectRatio'] as const;

/** 這個節點會用到的工作流程：指定了模型就只看那一個；空白就看同類型、呼叫方式已知的所有模型 */
export function workflowsForPrompt(_prompt: PromptFile, _config: WorkflowConfig): [string, WorkflowModel][] {
  throw new Error('尚未實作');
}

/** 儲存前的檢查；回傳中文錯誤訊息（和 prompt-studio/lib/bindings.js 相同） */
export function validateBindings(_prompt: PromptFile, _config: WorkflowConfig): string[] {
  throw new Error('尚未實作');
}

export class CallBuildError extends Error {
  override name = 'CallBuildError';
}

/**
 * 依工作流程與呼叫綁定組出 MCP 呼叫：
 * - 從 args 複製一份，再把每個 slot 的值寫到它的 paths
 * - slot 有 template 時先套用（例如 Gemini 把秒數與比例寫進指令）
 * - 有 seed slot、但沒有綁定時，用 options.seed
 * - 值不在 allowed、超出 min／max，或模型的呼叫方式還不知道時丟出 CallBuildError
 */
export function buildMcpCall(_input: {
  modelKey: string;
  config: WorkflowConfig;
  bindings: PromptBindings;
  /** 綁定來源的值：output.prompt、target.aspectRatio 與各變數（巢狀物件，點號取值） */
  values: Record<string, unknown>;
  seed: number;
}): McpCall {
  throw new Error('尚未實作');
}
