import type { PromptFile } from '@templeyard/shared';
import { lookup, present } from './values.js';

// 組裝送給 AI 的內容；規則和 prompt-studio/lib/prompt.js 的 render 相同（管理頁預覽 = 實際送出）

export type RenderedRequest = {
  promptId: string;
  promptVersion: number;
  step: number;
  target: PromptFile['target'];
  system: string;
  messages: { role: 'user'; content: string }[];
  output?: PromptFile['output'];
};

export type RenderResult = { missing: string[]; request: RenderedRequest };

const PLACEHOLDER = /\{\{\s*([a-zA-Z_][\w.]*)\s*\}\}/g;

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value, null, 2);
}

/** 把 {{變數}} 換成值；沒有值的換成空字串 */
export function fill(text: string, vars: Record<string, unknown>): string {
  return text.replace(PLACEHOLDER, (_, name: string) => {
    const value = lookup(vars, name);
    return present(value) ? stringify(value) : '';
  });
}

/** 帶入變數（可用點號表示巢狀），附上所選模型的寫法；回傳缺少的必填變數 */
export function renderPrompt(prompt: PromptFile, variables: Record<string, unknown>, options: { model?: string } = {}): RenderResult {
  const model = options.model || prompt.target.model || '';
  const rules = model ? prompt.modelRules?.[model] : undefined;
  const missing = prompt.variables.filter((v) => v.required && !present(lookup(variables, v.name))).map((v) => v.name);
  const request: RenderedRequest = {
    promptId: prompt.id,
    promptVersion: prompt.version,
    step: prompt.step,
    target: model ? { ...prompt.target, model } : prompt.target,
    system: [fill(prompt.system, variables).trim(), rules ? fill(rules, variables).trim() : ''].filter(Boolean).join('\n\n'),
    messages: [{ role: 'user', content: fill(prompt.template, variables).trim() }],
  };
  if (prompt.output) request.output = prompt.output;
  return { missing, request };
}
