import { z } from 'zod';

// AI 輔助撰寫（01 F18、05 ai_assist_logs、POST /api/assist）

export type AssistScope = 'series' | 'video';

export type AssistField = {
  key: string;
  /** 寫給 Claude 的欄位名稱 */
  label: string;
  /** series：系列表單（可能還沒有系列）；video：要指定影片 */
  scope: AssistScope;
  /** 使用 Prompt Studio 的文字節點（prompt-studio/prompts/<node>.json）；沒有時用通用的輔助撰寫指令 */
  node?: string;
};

/** 第 1～4 步可以使用 AI 幫我寫的欄位（06 第 6 階段：先接上第 1～4 步） */
export const ASSIST_FIELDS = [
  { key: 'series.visualStyle', label: '系列的整體視覺風格', scope: 'series' },
  { key: 'video.templeNotes', label: '寺廟歷史與簡介（整理成條列）', scope: 'video' },
  { key: 'templeView.instruction', label: '寺廟定裝版視角圖的修改指令', scope: 'video' },
  { key: 'creative.input', label: '創作需求（把一句話擴寫成完整的需求）', scope: 'video' },
  { key: 'questionnaire.story', label: '想講的故事', scope: 'video', node: 'copy-polish' },
  { key: 'questionnaire.mustSay', label: '一定要說到的事', scope: 'video' },
  { key: 'questionnaire.custom', label: '問卷題目的「或自己寫」', scope: 'video' },
  // 第 8 階段：方案的角色卡（規格書「5 分鏡方案：新角色的描述與連續性鎖」）
  // 系列設定的角色庫沒有影片（使用者 2026-11-05 提出），所以只要有系列就可以用
  { key: 'character.description', label: '角色的外觀描述', scope: 'series', node: 'character-design' },
  { key: 'character.locks', label: '角色的連續性鎖', scope: 'series', node: 'character-design' },
  // 第 10 階段：分鏡細修「限定範圍修改的指令」
  { key: 'shot.regionEdit', label: '限定範圍修改的指令（只改圈選的一處）', scope: 'video' },
] as const satisfies readonly AssistField[];

export type AssistFieldKey = (typeof ASSIST_FIELDS)[number]['key'];

export function findAssistField(key: string): AssistField | undefined {
  return ASSIST_FIELDS.find((field) => field.key === key);
}

export const MAX_ASSIST_INPUT_LENGTH = 2000;

export const assistRequestSchema = z.object({
  field: z.string({ error: '這個欄位不能使用 AI 幫我寫' }),
  seriesId: z.string().optional(),
  videoId: z.string().optional(),
  /** 使用者已經打的內容；可以留白 */
  userInput: z.string().max(MAX_ASSIST_INPUT_LENGTH, `內容最多 ${MAX_ASSIST_INPUT_LENGTH} 字`).default(''),
  /** 欄位所在的位置：定裝版的哪個視角、問卷的哪一題 */
  target: z.object({ viewKey: z.string().optional(), questionId: z.string().optional(), characterId: z.string().optional() }).default({}),
});
export type AssistRequest = z.input<typeof assistRequestSchema>;

export const assistLogSchema = z.object({
  id: z.string(),
  seriesId: z.string().nullable(),
  videoId: z.string().nullable(),
  field: z.string(),
  userInput: z.string(),
  suggestion: z.string(),
  adopted: z.boolean(),
  createdAt: z.string(),
});
export type AssistLog = z.infer<typeof assistLogSchema>;

export const assistResponseSchema = z.object({ log: assistLogSchema });

/** Claude 回的輔助撰寫內容：通用指令回 { suggestion }，copy-polish 回 { polished, notes? } */
export const assistOutputSchema = z.object({ suggestion: z.string().trim().min(1) });
export const copyPolishOutputSchema = z.object({ polished: z.string().trim().min(1), notes: z.string().optional() });

/** character-design 節點的輸出（prompt-studio/prompts/character-design.json） */
export const characterDesignOutputSchema = z.object({
  name: z.string(),
  description: z.string().trim().min(1),
  identityAnchors: z.array(z.string()).default([]),
  look: z.string().default(''),
  continuityLocks: z.array(z.string()).default([]),
});
