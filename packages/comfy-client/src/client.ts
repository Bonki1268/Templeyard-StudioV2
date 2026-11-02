import type { McpCall } from '@templeyard/shared';
import type { McpSession } from './rpc.js';
import type { JobState } from './results.js';

export type SubmitResult =
  | { kind: 'submitted'; promptId: string }
  /** 雲端要求確認花費，任務還沒開始；message 是雲端回的文字 */
  | { kind: 'confirm_required'; message: string }
  /** 直接回傳檔案、沒有任務編號（少見） */
  | { kind: 'completed'; urls: string[] };

export type WaitResult =
  | { kind: 'completed'; urls: string[] }
  | { kind: 'failed'; message: string }
  | { kind: 'timeout' };

export type DownloadedFile = { bytes: Uint8Array; mime: string };

export type ComfyClient = {
  /** confirm 只有在本系統的同意與上限檢查都通過後才會是 true */
  submit(call: McpCall, options: { confirm: boolean }): Promise<SubmitResult>;
  getJobState(promptId: string): Promise<{ state: JobState; message: string | null }>;
  getOutputUrls(promptId: string): Promise<string[]>;
  /** 輪詢到完成、失敗或逾時；連續 5 次查詢失敗才算失敗 */
  waitForJob(promptId: string, options: { startedAt: number }): Promise<WaitResult>;
  download(url: string): Promise<DownloadedFile>;
};

export type ComfyClientOptions = {
  session: McpSession;
  fetch?: typeof fetch;
  /** 輪詢間隔，預設 4 秒 */
  pollMs?: number;
  /** 單一任務逾時，預設 20 分鐘（02「逾時」） */
  timeoutMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export function createComfyClient(_options: ComfyClientOptions): ComfyClient {
  throw new Error('尚未實作');
}
