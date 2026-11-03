import type { ClaudeModel } from '@templeyard/agent';
import type { AssistLog, PromptFile, assistRequestSchema } from '@templeyard/shared';
import type { z } from 'zod';
import type { AppDatabase } from '../db/client.js';
import type { Clock } from '../series/repository.js';

// AI 輔助撰寫（F18）：產生建議並記錄；只有按「採用」才記為已採用。不會送出或觸發任何生成。

export type AssistInput = z.output<typeof assistRequestSchema>;

export type AssistService = {
  /**
   * 產生建議：
   * - 欄位不在清單：StudioError 400「這個欄位不能使用 AI 幫我寫」
   * - 影片的欄位沒有指定影片：400「這個欄位要指定影片」
   * - 影片不存在：404「找不到這支影片」；系列不存在：404「找不到這個系列」
   * - 沒有設定 Claude：503
   * - 呼叫 Claude 失敗或格式不正確：502，說明原因
   * - 有 node 的欄位用 Prompt Studio 的文字節點，其他用通用的輔助撰寫指令
   * - 影片的欄位，紀錄的 series_id 是這支影片的系列
   */
  suggest(input: AssistInput): Promise<AssistLog>;
  /** 找不到：StudioError 404「找不到這筆 AI 建議」 */
  find(id: string): AssistLog;
  adopt(id: string): AssistLog;
};

export function createAssistService(_deps: {
  db: AppDatabase;
  clock: Clock;
  prompts: ReadonlyMap<string, PromptFile>;
  model: ClaudeModel | null;
  unavailableMessage?: string;
}): AssistService {
  throw new Error('尚未實作');
}
