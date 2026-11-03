import { Sparkles } from 'lucide-react';
import { useId } from 'react';
import { Button } from '../../components/Button';
import styles from './AiSuggestion.module.css';

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

/** AI 寫的內容先顯示在這裡，按「採用」才填入欄位；不會自動送出 */
export function AiSuggestion({ field, suggestion, busy, error, onAdopt, onRetry, onDismiss }: AiSuggestionProps) {
  const titleId = useId();
  return (
    <section className={styles.panel} aria-label={`AI 建議：${field}`}>
      <h3 id={titleId} className={styles.title}>
        <Sparkles size={16} strokeWidth={1.8} aria-hidden="true" />
        AI 建議
      </h3>
      {busy && (
        <p role="status" className={styles.status}>
          AI 正在寫建議…
        </p>
      )}
      {!busy && error && (
        <div role="alert" className={styles.error}>
          {error}
        </div>
      )}
      {!busy && !error && suggestion && <p className={styles.text}>{suggestion}</p>}
      <div className={styles.actions}>
        <Button variant="primary" className={styles.adopt} disabled={busy || !suggestion || Boolean(error)} onClick={onAdopt}>
          採用
        </Button>
        <Button disabled={busy} onClick={onRetry}>
          再寫一版
        </Button>
        <Button onClick={onDismiss}>略過</Button>
      </div>
    </section>
  );
}
