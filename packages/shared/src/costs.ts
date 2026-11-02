import { z } from 'zod';

// 費用控制（docs/02-TRD.md「費用控制」、05「後端強制的規則」）。單位是 Comfy Cloud 的點數（credits）。

const credits = (error: string) => z.number({ error }).int({ error }).min(0, { error });

export const costItemSchema = z.object({
  model: z.string({ error: '請提供模型' }).min(1, { error: '請提供模型' }),
  /** 影片為秒數、圖片為張數、音樂為次數 */
  units: z.number({ error: '數量要是正數' }).positive({ error: '數量要是正數' }),
});
export type CostItem = z.infer<typeof costItemSchema>;

export const costRequestSchema = z.object({
  items: z.array(costItemSchema).min(1, { error: '請提供要預估的項目' }).max(50),
});

export type CostLine = { model: string; units: number; unitCredits: number | null; credits: number | null };
/** credits 為 null：有任一項的參考單價待實測 */
export type CostEstimate = { credits: number | null; lines: CostLine[] };

export const CONSENT_REASON_CODES = ['threshold_unset', 'over_threshold', 'over_limit', 'price_unknown'] as const;
export type ConsentReasonCode = (typeof CONSENT_REASON_CODES)[number];
export type ConsentReason = { code: ConsentReasonCode; message: string };

export type Budget = { spent: number; reserved: number; limit: number | null; threshold: number | null };

export type CostCheck = {
  estimate: CostEstimate;
  budget: Budget;
  consent: { required: boolean; reasons: ConsentReason[] };
};

export const settingsSchema = z.object({
  /** 單筆同意門檻（點數）；null 表示還沒設定，每次付費生成都要同意 */
  consentThresholdCredits: z.number().int().min(0).nullable(),
});
export type Settings = z.infer<typeof settingsSchema>;

export const updateSettingsSchema = z.object({
  consentThresholdCredits: credits('同意門檻要是 0 以上的整數點數').nullable(),
});

export const COST_LIMIT_ERROR = '費用上限要是 0 以上的整數點數';
export const costLimitSchema = credits(COST_LIMIT_ERROR).nullable();

/** 「124 點」；null 顯示「[待實測]」（04 文案規則：未決定的數字用方括號占位） */
export function creditsText(value: number | null): string {
  return value === null ? '[待實測]' : `${value.toLocaleString('en-US')} 點`;
}
