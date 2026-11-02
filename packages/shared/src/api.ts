import { z } from 'zod';

/** API 錯誤回應：message 給人看；fieldErrors 對應表單欄位 */
export const apiErrorSchema = z.object({
  message: z.string(),
  fieldErrors: z.record(z.string(), z.string()).optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
