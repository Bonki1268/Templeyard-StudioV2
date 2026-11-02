export type Option<T extends string | number> = { value: T; label: string };

export type OptionGroupProps<T extends string | number> = {
  legend: string;
  options: readonly Option<T>[];
  /** 目前選取的值；自己寫時為 null */
  value: T | null;
  onChange: (value: T) => void;
  /** 「或自己寫」：有傳才顯示；填寫時由上層取消選項 */
  other?: { value: string; onChange: (text: string) => void };
};

/** 單選的選項按鈕群組：fieldset＋legend，選取狀態以 aria-pressed 標示 */
export function OptionGroup<T extends string | number>(_props: OptionGroupProps<T>) {
  return null;
}
