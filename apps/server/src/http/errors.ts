import type { ApiError } from '@templeyard/shared';
import type { z } from 'zod';

/** 把 Zod 的驗證錯誤轉成 API 錯誤回應：每個欄位取第一則說明 */
export function toValidationError(_error: z.ZodError, _message: string): ApiError {
  throw new Error('尚未實作');
}
