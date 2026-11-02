import type { ReactNode } from 'react';

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

export function TextField(_props: TextFieldProps) {
  return null;
}
