import type { PromptFile } from '@templeyard/shared';

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

/** 帶入變數（可用點號表示巢狀），附上所選模型的寫法；回傳缺少的必填變數 */
export function renderPrompt(_prompt: PromptFile, _variables: Record<string, unknown>, _options: { model?: string } = {}): RenderResult {
  throw new Error('尚未實作');
}
