import { z } from 'zod';

// workflows/models.json：各模型的 Comfy Cloud MCP 呼叫設定（模型代號、範本名稱、節點編號都放這裡，不寫死在程式裡）

/** 呼叫參數裡可以填資料的位置（slot）；prompt JSON 的呼叫綁定只能用這些名稱 */
export const SLOT_NAMES = ['prompt', 'aspectRatio', 'durationSec', 'seed'] as const;
export const slotNameSchema = z.enum(SLOT_NAMES);
export type SlotName = z.infer<typeof slotNameSchema>;

const slotSchema = z.object({
  /** 寫進 MCP 呼叫參數的位置（args 底下的路徑）；可以同時寫到好幾個位置；空陣列表示只用在 template */
  paths: z.array(z.array(z.string().min(1)).min(1)),
  /** 寫入前先套用的樣板，例如 Gemini 的「A {{durationSec}}-second, {{aspectRatio}} clip. {{prompt}}」 */
  template: z.string().optional(),
  allowed: z.array(z.string()).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});
export type WorkflowSlot = z.infer<typeof slotSchema>;

export const modelPriceSchema = z.object({
  unit: z.enum(['second', 'image', 'run']),
  /** 每個單位的參考點數；null 表示待實測 */
  credits: z.number().nonnegative().nullable(),
  verified: z.boolean(),
});
export type ModelPrice = z.infer<typeof modelPriceSchema>;

export const workflowModelSchema = z.object({
  label: z.string().min(1),
  kind: z.enum(['image', 'video', 'audio']),
  /** verified 已實測、unverified 有代號但還沒實測、unknown 呼叫方式還沒確認（不能呼叫） */
  status: z.enum(['verified', 'unverified', 'unknown']),
  tool: z.enum(['partner_generate', 'run_template']).optional(),
  args: z.record(z.string(), z.unknown()).optional(),
  slots: z.partialRecord(slotNameSchema, slotSchema).optional(),
  price: modelPriceSchema,
});
export type WorkflowModel = z.infer<typeof workflowModelSchema>;

export const workflowConfigSchema = z.object({
  version: z.number().int().positive(),
  note: z.string().optional(),
  models: z.record(z.string().min(1), workflowModelSchema),
});
export type WorkflowConfig = z.infer<typeof workflowConfigSchema>;

/** 送往 MCP 的一次呼叫 */
export type McpCall = { tool: 'partner_generate' | 'run_template'; args: Record<string, unknown> };
