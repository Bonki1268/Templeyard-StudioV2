import type { AssistField } from '@templeyard/shared';

// AI 輔助撰寫（規格書「AI 輔助撰寫」）：先建議、後採用；內容只用提供的資料，不新增沒有來源的寺廟事實。

export const ASSIST_ROLE = '你是廟埕影室的 AI 輔助撰寫';

export type AssistContext = {
  field: AssistField;
  userInput: string;
  temple: { name: string; district: string; deity: string; builtYear: number | null } | null;
  userTempleNotes: string;
  series: { visualStyle: string; direction: string; durationSec: number } | null;
  creativeInput: string | null;
  /** 定裝版視角圖的名稱（templeView.instruction） */
  viewName: string | null;
  /** 問卷題目（questionnaire.custom） */
  questionTitle: string | null;
};

/**
 * 通用的輔助撰寫請求：
 * - system：角色（ASSIST_ROLE）、內容與宗教規則、輸出格式 {"suggestion": "..."}
 * - user：要寫的欄位、使用者的輸入（留白時說明「使用者沒有輸入，請依資料寫一版」）、寺廟、使用者提供的歷史、
 *   系列設定、創作輸入、視角或題目；沒有的資料不列出
 */
export function buildAssistRequest(_context: AssistContext): { system: string; user: string } {
  throw new Error('尚未實作');
}

/** copy-polish 節點（想講的故事）的變數：prompt-studio/prompts/copy-polish.json 的變數清單 */
export function copyPolishVariables(_context: AssistContext): Record<string, unknown> {
  throw new Error('尚未實作');
}

export class AssistOutputError extends Error {
  override name = 'AssistOutputError';
}

/**
 * 解析 Claude 回的建議：允許前後空白與 ```json 程式碼區塊；
 * generic 取 suggestion，copy-polish 取 polished；格式不正確丟出 AssistOutputError「AI 建議的格式不正確，請再試一次」
 */
export function parseAssistOutput(_text: string, _kind: 'generic' | 'copy-polish'): string {
  throw new Error('尚未實作');
}
