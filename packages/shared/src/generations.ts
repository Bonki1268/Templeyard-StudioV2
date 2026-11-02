// 生成紀錄的狀態（docs/05-Backend-Schema.md「generations」）
export const GENERATION_STATUSES = ['awaiting_confirm', 'submitted', 'running', 'succeeded', 'failed', 'timeout'] as const;
export type GenerationStatus = (typeof GENERATION_STATUSES)[number];

/** 還沒結束、重啟後要繼續追蹤的狀態 */
export const UNFINISHED_STATUSES: readonly GenerationStatus[] = ['submitted', 'running'];
