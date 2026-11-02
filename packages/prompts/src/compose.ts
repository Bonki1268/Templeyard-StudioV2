import type { WrittenPrompt } from '@templeyard/shared';
import { findMissingLocks } from './locks.js';
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

function retryNote(missing: readonly string[]): string {
  return `上一版的最終指令缺少以下連續性鎖，請把每一條原樣（不翻譯、不改寫、不放在否定詞之後）寫進最終指令後重寫：\n${missing
    .map((lock) => `- ${lock}`)
    .join('\n')}`;
}

/**
 * 圖片與影片節點的最終指令：
 * 有自訂指令就以自訂指令為準；否則請撰寫者寫，缺少連續性鎖時重寫一次，仍缺少就丟出 MissingLocksError。
 */
export async function composeFinalPrompt(input: {
  request: RenderedRequest;
  locks: readonly string[];
  writer: PromptWriter;
  customPrompt?: string | null;
}): Promise<ComposedPrompt> {
  const custom = input.customPrompt?.trim();
  if (custom) {
    return { prompt: custom, notes: undefined, source: 'custom', attempts: 0, lockWarnings: findMissingLocks(custom, input.locks) };
  }

  const first = await input.writer.write(input.request);
  const missing = findMissingLocks(first.prompt, input.locks);
  if (missing.length === 0) return { prompt: first.prompt, notes: first.notes, source: 'writer', attempts: 1, lockWarnings: [] };

  const second = await input.writer.write(input.request, { retryNote: retryNote(missing) });
  const stillMissing = findMissingLocks(second.prompt, input.locks);
  if (stillMissing.length > 0) throw new MissingLocksError(stillMissing);
  return { prompt: second.prompt, notes: second.notes, source: 'writer', attempts: 2, lockWarnings: [] };
}
