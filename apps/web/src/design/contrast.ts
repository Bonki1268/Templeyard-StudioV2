/** WCAG 2 對比值（1～21） */
export function contrastRatio(_foreground: string, _background: string): number {
  throw new Error('尚未實作');
}

/** 從 CSS 文字讀出 `--name: value;` 形式的 token */
export function parseCssTokens(_css: string): Record<string, string> {
  throw new Error('尚未實作');
}
