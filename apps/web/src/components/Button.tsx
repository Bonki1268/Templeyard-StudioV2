import type { ButtonHTMLAttributes } from 'react';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** primary：朱紅底白字，每個畫面最多一個；secondary：白底細框 */
  variant?: 'primary' | 'secondary';
};

export function Button(_props: ButtonProps) {
  return null;
}
