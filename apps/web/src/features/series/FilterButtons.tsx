// 篩選按鈕群組（角色庫、過去的影片）：一組按鈕，目前選取的以 aria-pressed 標示，名稱含數量（例如「製作中 3」）

export type FilterOption<T extends string> = { value: T; label: string; count: number };

export type FilterButtonsProps<T extends string> = { label: string; options: readonly FilterOption<T>[]; value: T; onChange: (value: T) => void };

export function FilterButtons<T extends string>(_props: FilterButtonsProps<T>): never {
  throw new Error('尚未實作：FilterButtons');
}
