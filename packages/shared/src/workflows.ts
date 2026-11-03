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

/**
 * 參考圖（去識別後的照片、視角圖）寫進 MCP 呼叫參數的位置。
 * 07「下一輪測試」第 1、4 項還沒實測，正式設定檔不填；沒有這一項的模型不能用參考圖生成。
 */
export const referenceSlotSchema = z.object({
  /** 參考圖清單寫進 args 底下的路徑（值是雲端參照的陣列） */
  paths: z.array(z.array(z.string().min(1)).min(1)).min(1),
  /** 最多幾張 */
  max: z.number().int().positive(),
});
export type ReferenceSlot = z.infer<typeof referenceSlotSchema>;

/**
 * 本機圖片上傳到 Comfy Cloud 的 MCP 工具（07「下一輪測試」第 1 項：tools/list 還沒實測）。
 * null 表示還不知道怎麼上傳；這時任何要用參考圖的生成都會在送出前停下來說明原因。
 */
export const uploadConfigSchema = z.object({
  tool: z.string().min(1),
  /** 固定的參數 */
  args: z.record(z.string(), z.unknown()).default({}),
  /** 檔案內容（base64）寫進 args 的哪個位置 */
  dataPath: z.array(z.string().min(1)).min(1),
  /** MIME 寫進 args 的哪個位置（選填） */
  mimePath: z.array(z.string().min(1)).min(1).optional(),
  /** 檔名寫進 args 的哪個位置（選填） */
  namePath: z.array(z.string().min(1)).min(1).optional(),
  /** 回應（structuredContent 或 JSON 文字）裡雲端參照的位置 */
  refPath: z.array(z.string().min(1)).min(1),
});
export type UploadConfig = z.infer<typeof uploadConfigSchema>;

export const workflowModelSchema = z.object({
  label: z.string().min(1),
  kind: z.enum(['image', 'video', 'audio']),
  /** verified 已實測、unverified 有代號但還沒實測、unknown 呼叫方式還沒確認（不能呼叫） */
  status: z.enum(['verified', 'unverified', 'unknown']),
  tool: z.enum(['partner_generate', 'run_template']).optional(),
  args: z.record(z.string(), z.unknown()).optional(),
  slots: z.partialRecord(slotNameSchema, slotSchema).optional(),
  references: referenceSlotSchema.optional(),
  /**
   * 影片模型的首格與末格（首尾畫格）放在呼叫參數的哪裡（07「下一輪測試」：Gemini 的圖片輸入範本還沒實測）。
   * 沒有設定時，影片生成會在送出前停下來說明原因。
   */
  frameInputs: z
    .object({
      first: z.object({ paths: z.array(z.array(z.string().min(1)).min(1)).min(1) }),
      last: z.object({ paths: z.array(z.array(z.string().min(1)).min(1)).min(1) }).optional(),
    })
    .optional(),
  price: modelPriceSchema,
});
export type WorkflowModel = z.infer<typeof workflowModelSchema>;

export const workflowConfigSchema = z.object({
  version: z.number().int().positive(),
  note: z.string().optional(),
  upload: uploadConfigSchema.nullable().default(null),
  models: z.record(z.string().min(1), workflowModelSchema),
  /** 成品的背景音樂（02：ACE-Step 生成）；沒有設定時成品不加背景音樂 */
  music: z.object({ model: z.string().min(1), tags: z.string().min(1) }).nullable().default(null),
});
export type WorkflowConfig = z.infer<typeof workflowConfigSchema>;

/** 送往 MCP 的一次呼叫 */
export type McpCall = { tool: 'partner_generate' | 'run_template'; args: Record<string, unknown> };
