import type { McpCall } from '@templeyard/shared';
import { ComfyAuthError, ComfyError } from './errors.js';
import { failureMessage, findFileUrls, findPromptId, isSpendConfirmation, jobState, type JobState } from './results.js';
import type { McpSession } from './rpc.js';

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

const MAX_POLL_FAILURES = 5;
/** 輸出連結格式：get_output 時告訴雲端我們的作業系統（與實測時相同） */
const CLIENT_OS = 'darwin';

export function createComfyClient(options: ComfyClientOptions): ComfyClient {
  const { session } = options;
  const doFetch = options.fetch ?? fetch;
  const pollMs = options.pollMs ?? 4000;
  const timeoutMs = options.timeoutMs ?? 20 * 60 * 1000;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  async function getJobState(promptId: string) {
    const result = await session.callTool('get_job_status', { prompt_id: promptId });
    const state = jobState(result);
    if (state === 'cancelled') return { state, message: '任務已取消' };
    return { state, message: state === 'failed' ? failureMessage(result) : null };
  }

  async function getOutputUrls(promptId: string) {
    const result = await session.callTool('get_output', { prompt_id: promptId, client_os: CLIENT_OS, inline_urls: false });
    if (result.isError) throw new ComfyError(result.text.slice(0, 500) || '取得輸出失敗');
    return findFileUrls(result);
  }

  return {
    async submit(call, { confirm }) {
      const args = confirm ? { ...call.args, confirm: true } : call.args;
      const result = await session.callTool(call.tool, args);
      const promptId = findPromptId(result);
      if (promptId) return { kind: 'submitted', promptId };
      const urls = findFileUrls(result);
      if (urls.length > 0) return { kind: 'completed', urls };
      if (!confirm && isSpendConfirmation(result)) return { kind: 'confirm_required', message: result.text };
      throw new ComfyError(result.text.slice(0, 800) || 'Comfy Cloud 沒有接受這個任務');
    },

    getJobState,
    getOutputUrls,

    async waitForJob(promptId, { startedAt }) {
      let failures = 0;
      for (;;) {
        if (now() - startedAt >= timeoutMs) return { kind: 'timeout' };
        let status: { state: JobState; message: string | null };
        try {
          status = await getJobState(promptId);
          failures = 0;
        } catch (error: unknown) {
          failures += 1;
          if (error instanceof ComfyAuthError || failures >= MAX_POLL_FAILURES) {
            return { kind: 'failed', message: error instanceof Error ? error.message : '查詢任務狀態失敗' };
          }
          await sleep(pollMs);
          continue;
        }
        if (status.state === 'completed') {
          const urls = await getOutputUrls(promptId);
          if (urls.length === 0) return { kind: 'failed', message: '任務完成了，但 Comfy Cloud 沒有回傳可下載的檔案連結' };
          return { kind: 'completed', urls };
        }
        if (status.state === 'failed' || status.state === 'cancelled') {
          return { kind: 'failed', message: status.message ?? '生成失敗，Comfy Cloud 沒有提供原因。' };
        }
        await sleep(pollMs);
      }
    },

    async download(url) {
      let response: Response;
      try {
        response = await doFetch(url);
      } catch {
        throw new ComfyError('下載產出檔案失敗：連不上');
      }
      if (!response.ok) throw new ComfyError(`下載產出檔案失敗（HTTP ${response.status}）`);
      const mime = (response.headers.get('content-type') ?? 'application/octet-stream').split(';')[0]?.trim() ?? '';
      return { bytes: new Uint8Array(await response.arrayBuffer()), mime };
    },
  };
}
