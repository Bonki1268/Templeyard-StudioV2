// 「AI 建議」區塊（04：--color-ai-surface 底、標題「AI 建議」、按鈕「採用」「再寫一版」「略過」）

export type AiSuggestionProps = {
  /** 這是哪個欄位的建議（區塊名稱「AI 建議：欄位」） */
  field: string;
  suggestion: string | null;
  busy: boolean;
  error: string | null;
  onAdopt: () => void;
  onRetry: () => void;
  onDismiss: () => void;
};

/** 尚未實作 */
export function AiSuggestion(_props: AiSuggestionProps) {
  return null;
}
