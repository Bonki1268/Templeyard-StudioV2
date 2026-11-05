import styles from './FilterButtons.module.css';

// 篩選按鈕群組（角色庫、過去的影片）：一組按鈕，目前選取的以 aria-pressed 標示，名稱含數量（例如「製作中 3」）

export type FilterOption<T extends string> = { value: T; label: string; count: number };

export type FilterButtonsProps<T extends string> = { label: string; options: readonly FilterOption<T>[]; value: T; onChange: (value: T) => void };

export function FilterButtons<T extends string>({ label, options, value, onChange }: FilterButtonsProps<T>) {
  return (
    <div role="group" aria-label={label} className={styles.group}>
      {options.map((option) => (
        <button key={option.value} type="button" className={styles.button} aria-pressed={option.value === value} onClick={() => onChange(option.value)}>
          {`${option.label} ${option.count}`}
        </button>
      ))}
    </div>
  );
}
