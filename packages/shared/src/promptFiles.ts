import { z } from 'zod';
import { slotNameSchema } from './workflows.js';

// prompt-studio/prompts/*.json 的格式（prompt-studio/README.md「Prompt 檔格式」）

export const promptVariableSchema = z.object({
  name: z.string().regex(/^[a-zA-Z_][\w.]*$/),
  label: z.string().optional(),
  required: z.boolean().optional(),
  example: z.unknown().optional(),
});

/**
 * 呼叫綁定：slot → 資料來源。
 * 資料來源是 output.prompt（第 1 段寫出的最終指令）、target.aspectRatio，或變數清單裡宣告過的變數。
 */
export const promptBindingsSchema = z.partialRecord(slotNameSchema, z.string().min(1));
export type PromptBindings = z.infer<typeof promptBindingsSchema>;

export const promptFileSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/),
  step: z.number().int().min(1).max(7),
  name: z.string().min(1),
  description: z.string().optional(),
  version: z.number().int().positive(),
  updatedAt: z.string().optional(),
  target: z.object({
    kind: z.enum(['text', 'image', 'video']),
    model: z.string(),
    aspectRatio: z.string().optional(),
  }),
  system: z.string(),
  template: z.string().min(1),
  variables: z.array(promptVariableSchema),
  output: z.object({ format: z.enum(['text', 'json']), schema: z.unknown().optional() }).optional(),
  modelRules: z.record(z.string(), z.string()).optional(),
  bindings: promptBindingsSchema.optional(),
  basis: z.array(z.string()).optional(),
});
export type PromptFile = z.infer<typeof promptFileSchema>;

/** 圖片與影片節點第 1 段（Claude 撰寫）的輸出 */
export const writtenPromptSchema = z.object({ prompt: z.string().min(1), notes: z.string().optional() });
export type WrittenPrompt = z.infer<typeof writtenPromptSchema>;
