import type { WrittenPrompt } from '@templeyard/shared';
import type { RenderedRequest } from './render.js';

/** 第 1 段的撰寫者（Claude，第 6 階段接上真的）；retryNote 是重寫時附上的說明 */
export interface PromptWriter {
  write(request: RenderedRequest, options?: { retryNote?: string }): Promise<WrittenPrompt>;
}

export class MissingLocksError extends Error {
  constructor(readonly missing: string[]) {
    super(`最終指令缺少連續性鎖：${missing.join('；')}`);
    this.name = 'MissingLocksError';
  }
}

export type ComposedPrompt = {
  prompt: string;
  notes: string | undefined;
  /** writer：由 Claude 撰寫；custom：這一格的自訂指令 */
  source: 'writer' | 'custom';
  /** 呼叫撰寫者的次數（自訂指令為 0） */
  attempts: number;
  /** 自訂指令缺少的鎖：以自訂指令為準，只提醒不擋下 */
  lockWarnings: string[];
};

/**
 * 圖片與影片節點的最終指令：
 * 有自訂指令就以自訂指令為準；否則請撰寫者寫，缺少連續性鎖時重寫一次，仍缺少就丟出 MissingLocksError。
 */
export function composeFinalPrompt(_input: {
  request: RenderedRequest;
  locks: readonly string[];
  writer: PromptWriter;
  customPrompt?: string | null;
}): Promise<ComposedPrompt> {
  throw new Error('尚未實作');
}
