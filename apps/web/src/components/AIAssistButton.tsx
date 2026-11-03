import { Sparkles } from 'lucide-react';
import { useId } from 'react';
import styles from './AIAssistButton.module.css';

export type AIAssistButtonProps = {
  onClick?: () => void;
  /** 有值時按鈕不能按，並在旁邊顯示原因 */
  disabledReason?: string | undefined;
  /** 這個按鈕幫哪個欄位寫；同一頁有多個時用來區分（名稱變成「AI 幫我寫：欄位」） */
  field?: string;
  /** 按鈕文字，預設「AI 幫我寫」；例如寺廟歷史用「AI 整理成條列」（03 App Flow） */
  label?: string;
};

/** 「AI 幫我寫」：白底、金色邊框與文字、星芒圖示、全圓角 */
export function AIAssistButton({ onClick, disabledReason, field, label = 'AI 幫我寫' }: AIAssistButtonProps) {
  const reasonId = useId();
  return (
    <span className={styles.wrapper}>
      <button
        type="button"
        className={styles.button}
        onClick={onClick}
        disabled={Boolean(disabledReason)}
        aria-describedby={disabledReason ? reasonId : undefined}
      >
        <Sparkles size={16} strokeWidth={1.8} aria-hidden="true" />
        {/* 有欄位名稱時，完整名稱只給輔助科技：用文字內容而不是 aria-label，按鈕才不會被當成那個欄位的標籤 */}
        {field ? (
          <>
            <span aria-hidden="true">{label}</span>
            <span className={styles.visuallyHidden}>{`${label}：${field}`}</span>
          </>
        ) : (
          label
        )}
      </button>
      {disabledReason && (
        <span id={reasonId} className={styles.reason}>
          {disabledReason}
        </span>
      )}
    </span>
  );
}
