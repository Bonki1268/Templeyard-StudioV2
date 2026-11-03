import { useId, type ReactNode } from 'react';
import styles from './OptionGroup.module.css';

export type Option<T extends string | number> = { value: T; label: string };

export type OptionGroupProps<T extends string | number> = {
  legend: string;
  options: readonly Option<T>[];
  /** 目前選取的值；自己寫時為 null */
  value: T | null;
  onChange: (value: T) => void;
  /** 「或自己寫」：有傳才顯示；填寫時由上層取消選項；accessory 放在輸入框旁（例如 AI 幫我寫） */
  other?: { value: string; onChange: (text: string) => void; accessory?: ReactNode };
  /** 群組標題旁的附加元件（例如來源標籤）；不算在群組名稱裡 */
  legendAccessory?: ReactNode;
  /** 整組不能選（例如已確認的定裝版） */
  disabled?: boolean;
};

/** 單選的選項按鈕群組：fieldset＋legend，選取狀態以 aria-pressed 標示 */
export function OptionGroup<T extends string | number>({
  legend,
  options,
  value,
  onChange,
  other,
  legendAccessory,
  disabled = false,
}: OptionGroupProps<T>) {
  const otherId = useId();
  return (
    <fieldset className={styles.group} disabled={disabled}>
      <legend className={styles.legend}>{legend}</legend>
      {legendAccessory && <div className={styles.legendAccessory}>{legendAccessory}</div>}
      <div className={styles.options}>
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            className={styles.option}
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {other && (
        <div className={styles.other}>
          <label className={styles.otherLabel} htmlFor={otherId}>
            或自己寫
          </label>
          <input
            id={otherId}
            className={styles.otherInput}
            value={other.value}
            onChange={(event) => other.onChange(event.target.value)}
          />
          {other.accessory}
        </div>
      )}
    </fieldset>
  );
}
