// 巢狀變數的取值（點號路徑），與 prompt-studio/lib/prompt.js 相同

export function lookup(vars: unknown, name: string): unknown {
  return name.split('.').reduce<unknown>((node, key) => {
    if (node === null || node === undefined || typeof node !== 'object') return undefined;
    return (node as Record<string, unknown>)[key];
  }, vars);
}

export function present(value: unknown): boolean {
  return !(value === undefined || value === null || (typeof value === 'string' && value.trim() === ''));
}
