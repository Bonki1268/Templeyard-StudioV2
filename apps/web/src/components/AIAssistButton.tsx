import { Sparkles } from 'lucide-react';
import { useId } from 'react';
import styles from './AIAssistButton.module.css';

export type AIAssistButtonProps = {
  onClick?: () => void;
  /** 有值時按鈕不能按，並在旁邊顯示原因 */
  disabledReason?: string | undefined;
  /** 這個按鈕幫哪個欄位寫；同一頁有多個時用來區分（名稱變成「AI 幫我寫：欄位」） */
  field?: string;
};

/** 「AI 幫我寫」：白底、金色邊框與文字、星芒圖示、全圓角 */
export function AIAssistButton({ onClick, disabledReason, field }: AIAssistButtonProps) {
  const reasonId = useId();
  return (
    <span className={styles.wrapper}>
      <button
        type="button"
        className={styles.button}
        onClick={onClick}
        disabled={Boolean(disabledReason)}
        aria-label={field ? `AI 幫我寫：${field}` : undefined}
        aria-describedby={disabledReason ? reasonId : undefined}
      >
        <Sparkles size={16} strokeWidth={1.8} aria-hidden="true" />
        AI 幫我寫
      </button>
      {disabledReason && (
        <span id={reasonId} className={styles.reason}>
          {disabledReason}
        </span>
      )}
    </span>
  );
}
