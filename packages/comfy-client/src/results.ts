import type { ToolResult } from './rpc.js';

// 從 MCP 的工具回應找出需要的資訊（格式依 07 實測與 server.mjs）

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** data 與 text 接成一段，方便用正規表示式找 */
const flat = (result: ToolResult) => `${JSON.stringify(result.data ?? '')}\n${result.text}`;

/** 回應裡的 prompt_id；沒有時回傳 null */
export function findPromptId(result: ToolResult): string | null {
  const match = flat(result).match(/\\?"prompt_id\\?"\s*:\s*\\?"([\w-]+)/);
  return match?.[1] ?? null;
}

export type JobState = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

const DONE = new Set(['completed', 'succeeded', 'success']);
const FAILED = new Set(['error', 'failed', 'failure']);
const PENDING = new Set(['pending', 'queued', 'waiting']);

function rawStatus(result: ToolResult): string | null {
  const data = isRecord(result.data) ? result.data : {};
  const inner = isRecord(data.result) ? data.result : {};
  const value = inner.job_status ?? data.job_status ?? inner.status ?? data.status;
  if (typeof value === 'string') return value;
  const match = flat(result).match(/\\?"(?:job_status|status)\\?"\s*:\s*\\?"(\w+)/);
  return match?.[1] ?? null;
}

/** get_job_status 的狀態：job_status 優先於 result.status；completed／succeeded 為完成，error／failed 為失敗 */
export function jobState(result: ToolResult): JobState {
  if (result.isError) return 'failed';
  const status = rawStatus(result)?.toLowerCase() ?? '';
  if (DONE.has(status)) return 'completed';
  if (FAILED.has(status)) return 'failed';
  if (status === 'cancelled' || status === 'canceled') return 'cancelled';
  if (PENDING.has(status)) return 'pending';
  return 'running';
}

/** 失敗原因：優先用雲端的說明，不顯示整個狀態物件；最多 500 字 */
export function failureMessage(result: ToolResult): string {
  const data = isRecord(result.data) ? result.data : null;
  if (data) {
    const found = [data, isRecord(data.result) ? data.result : null]
      .filter((item): item is Record<string, unknown> => item !== null)
      .flatMap((item) => [item.error_message, item.message, isRecord(item.error) ? item.error.message : item.error, item.details])
      .find((value): value is string => typeof value === 'string' && value.length > 0);
    if (found) return found.slice(0, 500);
  }
  if (!data && result.text) return result.text.slice(0, 500);
  return '生成失敗，Comfy Cloud 沒有提供原因。';
}

/** 輸出連結：同一個結果有短連結（/api/s/）時只用短連結，否則取 storage 或 /api/view 的連結 */
export function findFileUrls(result: ToolResult): string[] {
  const body = flat(result).replace(/\\u0026/g, '&').replace(/\\\//g, '/');
  const urls = [...new Set(body.match(/https?:\/\/[^\s"'\\<>)`]+/g) ?? [])];
  const short = urls.filter((url) => /\/api\/s\//.test(url));
  if (short.length > 0) return short;
  return urls.filter((url) => /storage\.googleapis\.com|\/api\/view/.test(url));
}

/** 雲端要求確認花費：沒有 prompt_id、也沒有檔案連結，文字提到 confirm */
export function isSpendConfirmation(result: ToolResult): boolean {
  if (result.isError) return false;
  if (findPromptId(result) || findFileUrls(result).length > 0) return false;
  return /confirm/i.test(result.text);
}
