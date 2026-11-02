import { CircleAlert } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import styles from './TextField.module.css';

export type TextFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** 多行輸入 */
  multiline?: boolean;
  /** 錯誤訊息：顯示在欄位下方 */
  error?: string | undefined;
  /** 標籤右側的附加元件，例如 AI 幫我寫 */
  labelAccessory?: ReactNode;
  maxLength?: number;
  placeholder?: string;
};

export function TextField({ label, value, onChange, multiline, error, labelAccessory, maxLength, placeholder }: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const common = {
    id,
    className: styles.input,
    value,
    maxLength,
    placeholder,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errorId : undefined,
  };

  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <label className={styles.label} htmlFor={id}>
          {label}
        </label>
        {labelAccessory}
      </div>
      {multiline ? (
        <textarea {...common} rows={3} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input {...common} onChange={(event) => onChange(event.target.value)} />
      )}
      {error && (
        <p id={errorId} className={styles.error}>
          <CircleAlert size={16} strokeWidth={1.8} aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
