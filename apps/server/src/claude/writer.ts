import Anthropic from '@anthropic-ai/sdk';
import type { PromptWriter } from '@templeyard/prompts';
import { writtenPromptSchema, type WrittenPrompt } from '@templeyard/shared';

// 圖片與影片節點第 1 段的撰寫者：用 Claude API 把節點指令寫成最終指令（02「生成指令組裝」）。
// 模型代號由環境變數 CLAUDE_MODEL_ASSIST 決定（01「使用哪一個 Claude 模型」待決定），程式不寫死。

export type ClaudeWriterOptions = {
  apiKey: string;
  model: string;
  /** 測試把 SDK 指到假的 Claude API */
  baseURL?: string;
  maxTokens?: number;
};

/** Claude 回的內容不是合法的 { prompt, notes } */
export class ClaudeOutputError extends Error {
  override name = 'ClaudeOutputError';
}

/**
 * 解析 Claude 回的文字：允許前後空白與 ```json 程式碼區塊，內容要符合 writtenPromptSchema；
 * 不合法時丟出 ClaudeOutputError（訊息不含原文，避免把長文字塞進錯誤）
 */
const FORMAT_ERROR = 'Claude 回的最終指令格式不正確，請再試一次';

export function parseWrittenPrompt(text: string): WrittenPrompt {
  const trimmed = text.trim();
  // 依序試：整段、程式碼區塊（前後可以有說明文字）、第一個 { 到最後一個 }
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/.exec(trimmed)?.[1];
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  const braces = start >= 0 && end > start ? trimmed.slice(start, end + 1) : undefined;
  for (const candidate of [trimmed, fenced, braces]) {
    if (candidate === undefined) continue;
    try {
      return validWrittenPrompt(JSON.parse(candidate));
    } catch {
      // 試下一種
    }
  }
  throw new ClaudeOutputError(FORMAT_ERROR);
}

function validWrittenPrompt(value: unknown): WrittenPrompt {
  const result = writtenPromptSchema.safeParse(value);
  if (!result.success) throw new ClaudeOutputError(FORMAT_ERROR);
  return result.data;
}

/** Claude API 錯誤本文裡的 error.message */
function apiErrorMessage(error: InstanceType<typeof Anthropic.APIError>): string {
  const body = error.error as { error?: { message?: unknown } } | undefined;
  return typeof body?.error?.message === 'string' ? body.error.message : '';
}

/** 用工具強制 Claude 回 { prompt, notes }（2026-11-03 實測：真的 Claude 會在 JSON 前後加說明文字） */
const SUBMIT_TOOL = 'submit_final_prompt';
const submitTool = {
  name: SUBMIT_TOOL,
  description: '交出最終指令：prompt 是直接送給生成模型的最終指令；notes 是給使用者看的說明（取捨、風險或需要回到上游修改的地方）。',
  input_schema: {
    type: 'object' as const,
    properties: {
      prompt: { type: 'string', description: '直接送給生成模型的最終指令' },
      notes: { type: 'string', description: '給使用者看的說明' },
    },
    required: ['prompt'],
  },
};

/**
 * 送出：system 是節點指令與模型寫法，user 是帶入資料後的內容；重寫時把 retryNote 接在 user 後面。
 * 回應被拒絕（stop_reason 為 refusal）或被截斷（max_tokens）時丟出 ClaudeOutputError。
 */
export function createClaudePromptWriter(options: ClaudeWriterOptions): PromptWriter {
  const client = new Anthropic({ apiKey: options.apiKey, ...(options.baseURL ? { baseURL: options.baseURL } : {}) });
  return {
    async write(request, writeOptions) {
      const content = request.messages.map((message) => message.content).join('\n\n');
      const user = writeOptions?.retryNote ? `${content}\n\n${writeOptions.retryNote}` : content;
      const base = { model: options.model, max_tokens: options.maxTokens ?? 16000, system: request.system, messages: [{ role: 'user' as const, content: user }] };
      let response: Anthropic.Message;
      try {
        try {
          response = await client.messages.create({ ...base, tools: [submitTool], tool_choice: { type: 'tool', name: SUBMIT_TOOL } });
        } catch (error: unknown) {
          // 有的模型不接受強制工具呼叫（2026-11-03 實測 HTTP 400）：改用一般文字再送一次
          if (!(error instanceof Anthropic.BadRequestError)) throw error;
          response = await client.messages.create(base);
        }
      } catch (error: unknown) {
        if (error instanceof Anthropic.AuthenticationError) throw new Error('Claude API 的金鑰不正確，請檢查 ANTHROPIC_API_KEY');
        if (error instanceof Anthropic.APIError) {
          // 附上 Claude 說的原因（不含金鑰），方便判斷是模型代號、參數還是額度的問題
          const reason = apiErrorMessage(error).split(options.apiKey).join('[金鑰]').slice(0, 300);
          throw new Error(`Claude API 回應錯誤（HTTP ${error.status ?? '連線失敗'}）${reason ? `：${reason}` : ''}`);
        }
        throw new Error('連不上 Claude API，請確認網路');
      }
      if (response.stop_reason === 'refusal') throw new ClaudeOutputError('Claude 拒絕撰寫這段指令，請修改內容後再試');
      if (response.stop_reason === 'max_tokens') throw new ClaudeOutputError('Claude 的回應太長被截斷，請再試一次');
      const used = response.content.find((block) => block.type === 'tool_use' && block.name === SUBMIT_TOOL);
      if (used && used.type === 'tool_use') return validWrittenPrompt(used.input);
      // 沒有用工具時（例如舊的錄製回應）照文字解析
      const text = response.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
      return parseWrittenPrompt(text);
    },
  };
}
