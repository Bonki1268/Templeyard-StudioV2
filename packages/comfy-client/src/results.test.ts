import { describe, expect, it } from 'vitest';
import { failureMessage, findFileUrls, findPromptId, isSpendConfirmation, jobState } from './results.js';
import type { ToolResult } from './rpc.js';

const result = (text: string, data: unknown = null, isError = false): ToolResult => ({ text, data, isError });

describe('找出 prompt_id', () => {
  it('從 JSON 文字裡找', () => {
    expect(findPromptId(result('{"prompt_id": "abc-123", "status": "queued"}'))).toBe('abc-123');
  });

  it('從 structuredContent 找，文字裡沒有也可以', () => {
    expect(findPromptId(result('已送出', { prompt_id: 'p-9' }))).toBe('p-9');
  });

  it('跳脫過的 JSON 字串也找得到', () => {
    expect(findPromptId(result('{\\"prompt_id\\": \\"x-1\\"}'))).toBe('x-1');
  });

  it('沒有時回傳 null', () => {
    expect(findPromptId(result('請先確認花費'))).toBeNull();
  });
});

describe('任務狀態', () => {
  it.each([
    [{ result: { status: 'succeeded', job_status: 'completed' } }, 'completed'],
    [{ result: { status: 'running', job_status: 'running' } }, 'running'],
    [{ result: { job_status: 'pending' } }, 'pending'],
    [{ result: { job_status: 'queued' } }, 'pending'],
    [{ result: { status: 'failed', job_status: 'failed' } }, 'failed'],
    [{ result: { job_status: 'error' } }, 'failed'],
    [{ result: { job_status: 'cancelled' } }, 'cancelled'],
    [{ status: 'success' }, 'completed'],
  ])('%j → %s', (data, state) => {
    expect(jobState(result(JSON.stringify(data), data))).toBe(state);
  });

  it('job_status 優先於 result.status', () => {
    const data = { result: { status: 'succeeded', job_status: 'running' } };
    expect(jobState(result('', data))).toBe('running');
  });

  it('工具回傳錯誤時視為失敗', () => {
    expect(jobState(result('找不到這個任務', null, true))).toBe('failed');
  });

  it('只有文字時從文字裡找狀態', () => {
    expect(jobState(result('{"job_status": "completed"}'))).toBe('completed');
  });
});

describe('失敗原因', () => {
  it('優先用雲端的 error_message', () => {
    expect(failureMessage(result('', { result: { job_status: 'failed', error_message: '內容未通過審查' } }))).toBe('內容未通過審查');
  });

  it('沒有說明時用文字，最多 500 字', () => {
    expect(failureMessage(result('壞'.repeat(600)))).toHaveLength(500);
  });

  it('什麼都沒有時給一句固定的說明', () => {
    expect(failureMessage(result('', { result: { job_status: 'failed' } }))).toBe('生成失敗，Comfy Cloud 沒有提供原因。');
  });
});

describe('輸出連結', () => {
  it('有短連結時只用短連結', () => {
    const urls = findFileUrls(
      result('- https://cloud.comfy.org/api/s/AbC\n- https://storage.googleapis.com/b/x.png?sig=1\\u0026a=2'),
    );
    expect(urls).toEqual(['https://cloud.comfy.org/api/s/AbC']);
  });

  it('沒有短連結時用 storage 連結，並還原跳脫的 &', () => {
    expect(findFileUrls(result('see https://storage.googleapis.com/b/x.png?sig=1\\u0026a=2 now'))).toEqual([
      'https://storage.googleapis.com/b/x.png?sig=1&a=2',
    ]);
  });

  it('重複的連結只留一個；無關的連結不算', () => {
    expect(findFileUrls(result('https://cloud.comfy.org/api/s/A https://cloud.comfy.org/api/s/A https://docs.comfy.org'))).toEqual([
      'https://cloud.comfy.org/api/s/A',
    ]);
  });
});

describe('雲端要求確認花費', () => {
  it('沒有任務編號、沒有檔案，文字提到 confirm', () => {
    expect(isSpendConfirmation(result('This will spend 124 credits. Call again with confirm: true.'))).toBe(true);
  });

  it('有 prompt_id 就不是', () => {
    expect(isSpendConfirmation(result('{"prompt_id": "a", "note": "confirm"}'))).toBe(false);
  });

  it('一般的錯誤訊息不是', () => {
    expect(isSpendConfirmation(result('模型名稱不正確', null, true))).toBe(false);
  });
});
