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
  /** 參考圖寫進 args 底下的路徑 */
  paths: z.array(z.array(z.string().min(1)).min(1)).min(1),
  /** 模型一次收幾張 */
  max: z.number().int().positive(),
  /**
   * 寫入的格式（07 實測，2026-11-03；沒有設定時是 list）：
   * - list：雲端參照的陣列
   * - medias：partner_generate 的 medias 陣列，每張是 { role, name, subfolder, type: "input" }
   * - single：一個雲端參照（範本的 LoadImage.image；只能 1 張）
   */
  format: z.enum(['list', 'medias', 'single']).optional(),
  /** medias 格式的 role（例如 reference_image） */
  role: z.string().min(1).optional(),
  /** 參考圖比 max 多時，先拼成一張參考圖（最多拼幾張）；沒有設定時多的參考圖不送 */
  sheet: z.object({ max: z.number().int().min(2).max(9) }).optional(),
});
export type ReferenceSlot = z.infer<typeof referenceSlotSchema>;

/**
 * 本機圖片上傳到 Comfy Cloud 的 MCP 工具（07「下一輪測試」第 1 項：tools/list 還沒實測）。
 * null 表示還不知道怎麼上傳；這時任何要用參考圖的生成都會在送出前停下來說明原因。
 */
/**
 * 一次性網址上傳（07 實測，2026-11-03）：upload_file 收本機檔案路徑，回一行 PUT 指令（一次性網址就是授權），
 * PUT 上去後回 { name, subfolder, type }；雲端參照是 name（subfolder 不是空的時候是「subfolder/name」）
 */
export const signedPutUploadSchema = z.object({
  mode: z.literal('signed_put'),
  tool: z.string().min(1),
  clientOs: z.enum(['darwin', 'linux', 'windows']),
});

const base64UploadSchema = z.object({
  mode: z.literal('base64').optional(),
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

/** 用 base64 送進 MCP 工具（情境測試的假上傳工具用這個） */
export const uploadConfigSchema = z.union([signedPutUploadSchema, base64UploadSchema]);
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
      /** required：範本一定要末格（例如 Seedance 的首尾畫格範本；沒有末格時會用範本自帶的示範圖） */
      last: z.object({ paths: z.array(z.array(z.string().min(1)).min(1)).min(1), required: z.boolean().optional() }).optional(),
    })
    .optional(),
  /**
   * 有末格或中間關鍵畫格時改用的呼叫方式（例如 Gemini 的 r2v 範本）：
   * 換掉 args、slots、frameInputs、references；末格與關鍵畫格當參考圖送入
   */
  referenceVariant: z
    .object({
      args: z.record(z.string(), z.unknown()),
      slots: z.partialRecord(slotNameSchema, slotSchema),
      frameInputs: z.object({ first: z.object({ paths: z.array(z.array(z.string().min(1)).min(1)).min(1) }) }),
      references: referenceSlotSchema,
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
