import { z } from 'zod';

// 創作對話（01 F6、05 chat_messages、POST /api/videos/:id/chat 以 SSE 串流）

export const MAX_CHAT_LENGTH = 2000;

export const chatRequestSchema = z.object({
  content: z
    .string({ error: '請輸入想對 Agent 說的話' })
    .trim()
    .min(1, '請輸入想對 Agent 說的話')
    .max(MAX_CHAT_LENGTH, `內容最多 ${MAX_CHAT_LENGTH} 字`),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

/** Agent 執行的操作與結果摘要（05 tool_calls） */
export const toolCallSummarySchema = z.object({
  name: z.string(),
  /** 介面上顯示的名稱，例如「開啟問卷」 */
  label: z.string(),
  ok: z.boolean(),
  summary: z.string(),
});
export type ToolCallSummary = z.infer<typeof toolCallSummarySchema>;

export const chatMessageSchema = z.object({
  id: z.string(),
  videoId: z.string(),
  role: z.enum(['user', 'agent']),
  content: z.string(),
  toolCalls: z.array(toolCallSummarySchema),
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatListResponseSchema = z.object({ messages: z.array(chatMessageSchema) });

/** SSE 事件：先回存下來的使用者訊息，Agent 的文字與工具結果依序送出，最後是 done 或 error */
export const chatEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('user'), message: chatMessageSchema }),
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('tool'), call: toolCallSummarySchema }),
  z.object({ type: z.literal('done'), message: chatMessageSchema }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);
export type ChatEvent = z.infer<typeof chatEventSchema>;

/** 創作首頁的快捷標籤（規格書「3. 創作對話」） */
export const QUICK_TAGS = ['歷史故事', '神明傳說', '節慶活動', '景點導覽', '人物代言'] as const;
export type QuickTag = (typeof QUICK_TAGS)[number];

const OPENINGS: Record<QuickTag, (temple: string) => string> = {
  歷史故事: (temple) => `我想講${temple}的歷史故事：`,
  神明傳說: (temple) => `我想講${temple}主祀神明的傳說：`,
  節慶活動: (temple) => `我想介紹${temple}的節慶活動：`,
  景點導覽: (temple) => `我想帶大家逛${temple}：`,
  人物代言: (temple) => `我想請一位代言人介紹${temple}：`,
};

/** 快捷標籤帶入的句子開頭 */
export function quickTagOpening(tag: QuickTag, templeName: string): string {
  return OPENINGS[tag](templeName);
}

/**
 * 點快捷標籤：輸入框開頭已經是某個標籤的句子開頭時換掉它，保留後面的內容；
 * 否則把句子開頭加在最前面
 */
export function applyQuickTag(current: string, tag: QuickTag, templeName: string): string {
  const existing = QUICK_TAGS.map((t) => quickTagOpening(t, templeName)).find((opening) => current.startsWith(opening));
  const rest = existing ? current.slice(existing.length) : current;
  return quickTagOpening(tag, templeName) + rest;
}
