import type { ApiError } from '@templeyard/shared';

/** 只有說明的錯誤回應（404、409 等） */
export function errorBody(message: string): ApiError {
  return { message };
}
