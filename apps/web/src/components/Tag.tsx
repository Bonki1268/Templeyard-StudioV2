import { CircleAlert, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './Tag.module.css';

export type TagTone = 'neutral' | 'warning' | 'success' | 'error' | 'info';

export type TagProps = { tone?: TagTone; children: ReactNode };

/** 狀態標籤：一定有文字；錯誤與警告另加圖示 */
export function Tag({ tone = 'neutral', children }: TagProps) {
  return (
    <span className={`${styles.tag} ${styles[tone]}`}>
      {tone === 'warning' && <TriangleAlert size={14} strokeWidth={1.8} aria-hidden="true" />}
      {tone === 'error' && <CircleAlert size={14} strokeWidth={1.8} aria-hidden="true" />}
      {children}
    </span>
  );
}
