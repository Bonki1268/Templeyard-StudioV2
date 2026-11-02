import type { PromptFile, WorkflowConfig } from '@templeyard/shared';

/** 讀取資料夾裡所有 prompt JSON（不含 .history/），逐一以 Zod 驗證；有任何一份不合法就丟出錯誤並指出檔名 */
export function loadPromptFiles(_dir: string): Map<string, PromptFile> {
  throw new Error('尚未實作');
}

/** 讀取並驗證 workflows/models.json */
export function loadWorkflowConfig(_file: string): WorkflowConfig {
  throw new Error('尚未實作');
}
