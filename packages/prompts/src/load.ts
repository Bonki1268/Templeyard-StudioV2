import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { promptFileSchema, workflowConfigSchema, type PromptFile, type WorkflowConfig } from '@templeyard/shared';

/** 讀取資料夾裡所有 prompt JSON（不含 .history/），逐一以 Zod 驗證；有任何一份不合法就丟出錯誤並指出檔名 */
export function loadPromptFiles(dir: string): Map<string, PromptFile> {
  const prompts = new Map<string, PromptFile>();
  for (const name of readdirSync(dir).filter((file) => file.endsWith('.json')).sort()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path.join(dir, name), 'utf8'));
    } catch {
      throw new Error(`${name} 不是合法的 JSON`);
    }
    const result = promptFileSchema.safeParse(parsed);
    if (!result.success) {
      const issue = result.error.issues[0];
      throw new Error(`${name} 的格式不正確：${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}`.trim());
    }
    prompts.set(result.data.id, result.data);
  }
  return prompts;
}

/** 讀取並驗證 workflows/models.json */
export function loadWorkflowConfig(file: string): WorkflowConfig {
  const result = workflowConfigSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`${path.basename(file)} 的格式不正確：${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}`.trim());
  }
  return result.data;
}
