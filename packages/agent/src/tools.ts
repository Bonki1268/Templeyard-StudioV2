import type { ToolCallSummary } from '@templeyard/shared';
import { z } from 'zod';
import type { ToolSpec } from './types.js';

// Agent 的工具（02「工具呼叫」、規格書「創作 Agent」）：輸入用 Zod 驗證；
// 付費工具（paid）在執行前多一道檢查，必須帶有使用者確認過的同意憑證。

export type ToolContext = {
  /** 使用者在這一輪同意費用後拿到的憑證；沒有就是 null */
  consentToken: string | null;
};

export type ToolOutcome = { ok: boolean; content: string; summary: string };

export type AgentTool<I = unknown> = {
  name: string;
  /** 介面上顯示的名稱，例如「開啟問卷」 */
  label: string;
  /** 格式錯誤時說明的對象，例如「問卷」 */
  subject: string;
  description: string;
  inputSchema: z.ZodType<I>;
  paid: boolean;
  run(input: I, context: ToolContext): Promise<ToolOutcome>;
};

export type ToolRunStatus = 'ok' | 'failed' | 'invalid_input' | 'unknown_tool' | 'consent_required';

export type ToolRunResult = {
  status: ToolRunStatus;
  /** 回給 Claude 的工具結果 */
  content: string;
  call: ToolCallSummary;
  /** 格式錯誤時說明的對象（沒有這個工具時為 null） */
  subject: string | null;
};

export type ToolRegistry = {
  /** 送給 Claude 的工具清單（JSON Schema 由 Zod schema 轉出） */
  specs(): ToolSpec[];
  run(name: string, input: unknown, context: ToolContext): Promise<ToolRunResult>;
};

/** 讓不同輸入型別的工具可以放在同一個清單 */
export function defineTool<I>(tool: AgentTool<I>): AgentTool<unknown> {
  return tool as unknown as AgentTool<unknown>;
}

export const CONSENT_REQUIRED_RESULT = '這個操作會花錢，要先在畫面上顯示費用、取得使用者同意後才能執行；請先說明預估費用並等使用者同意';

/** Zod 的錯誤寫成給 Claude 看的說明：哪個欄位、哪裡不對 */
function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : '(整個輸入)'}：${issue.message}`).join('；');
}

/**
 * 執行工具：
 * - 沒有這個工具：unknown_tool
 * - 輸入不符合 schema：invalid_input，結果說明哪裡不對
 * - 付費工具沒有同意憑證或憑證不通過 verifyConsent：consent_required，不執行
 * - 工具丟出例外：failed，結果是錯誤訊息
 */
export function createToolRegistry(
  tools: readonly AgentTool<unknown>[],
  options: { verifyConsent(token: string | null, toolName: string): boolean },
): ToolRegistry {
  return {
    specs() {
      return tools.map((tool) => {
        const { $schema: _schema, ...schema } = z.toJSONSchema(tool.inputSchema, { io: 'input' }) as Record<string, unknown>;
        return { name: tool.name, description: tool.description, input_schema: schema };
      });
    },
    async run(name, input, context) {
      const tool = tools.find((t) => t.name === name);
      if (!tool) {
        const content = `沒有這個工具：${name}`;
        return { status: 'unknown_tool', content, subject: null, call: { name, label: name, ok: false, summary: content } };
      }
      const fail = (status: ToolRunStatus, content: string): ToolRunResult => ({
        status,
        content,
        subject: tool.subject,
        call: { name, label: tool.label, ok: false, summary: content },
      });
      const parsed = tool.inputSchema.safeParse(input);
      if (!parsed.success) return fail('invalid_input', `格式不正確：${describeIssues(parsed.error)}。請修正後再呼叫一次`);
      if (tool.paid && !options.verifyConsent(context.consentToken, name)) return fail('consent_required', CONSENT_REQUIRED_RESULT);
      try {
        const outcome = await tool.run(parsed.data, context);
        return {
          status: outcome.ok ? 'ok' : 'failed',
          content: outcome.content,
          subject: tool.subject,
          call: { name, label: tool.label, ok: outcome.ok, summary: outcome.summary },
        };
      } catch (error: unknown) {
        return fail('failed', error instanceof Error ? error.message : '工具執行失敗');
      }
    },
  };
}
