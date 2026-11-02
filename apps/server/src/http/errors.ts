import type { ApiError } from '@templeyard/shared';
import type { z } from 'zod';

/**
 * 把 Zod 的驗證錯誤轉成 API 錯誤回應：每個欄位取第一則說明。
 * 不屬於任何欄位的錯誤（例如「沒有要修改的欄位」）直接當成 message。
 */
export function toValidationError(error: z.ZodError, message: string): ApiError {
  const fieldErrors: Record<string, string> = {};
  let formError: string | undefined;
  for (const issue of error.issues) {
    const field = issue.path.map(String).join('.');
    if (!field) {
      formError ??= issue.message;
    } else if (!(field in fieldErrors)) {
      fieldErrors[field] = issue.message;
    }
  }
  if (Object.keys(fieldErrors).length === 0 && formError) return { message: formError };
  return { message, fieldErrors };
}
