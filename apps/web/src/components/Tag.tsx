import type { ReactNode } from 'react';

export type TagTone = 'neutral' | 'warning' | 'success' | 'error' | 'info';

export type TagProps = { tone?: TagTone; children: ReactNode };

/** 狀態標籤：一定有文字；錯誤與警告另加圖示 */
export function Tag(_props: TagProps) {
  return null;
}
