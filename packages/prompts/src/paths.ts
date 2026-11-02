import path from 'node:path';
import { fileURLToPath } from 'node:url';

// repo 裡的 prompt 與工作流程設定位置（測試與 server 共用）
export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const promptsDir = path.join(repoRoot, 'prompt-studio', 'prompts');
export const workflowsFile = path.join(repoRoot, 'workflows', 'models.json');
