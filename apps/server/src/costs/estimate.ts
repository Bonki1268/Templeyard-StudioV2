import type { Budget, ConsentReason, CostEstimate, CostItem, WorkflowConfig } from '@templeyard/shared';

/** 預估的模型不在 workflows/models.json */
export class UnknownModelError extends Error {
  constructor(readonly index: number, readonly model: string) {
    super('沒有這個模型的呼叫設定');
    this.name = 'UnknownModelError';
  }
}

/** 依參考單價預估：每項 = 數量 × 單價（四捨五入到整數點）；有任一項單價待實測時總額為 null */
export function estimateCost(_items: readonly CostItem[], _config: WorkflowConfig): CostEstimate {
  throw new Error('尚未實作');
}

/**
 * 要不要再次同意（02「費用控制」、05「後端強制的規則」）：
 * - 還沒設定單筆門檻 → 每次都要
 * - 這次預估超過單筆門檻 → 要
 * - 已用＋預留＋這次預估超過本支影片上限 → 要
 * - 有模型的單價待實測（無法預估）→ 要
 */
export function checkConsent(
  _estimate: CostEstimate,
  _budget: Budget,
  _config: WorkflowConfig,
): { required: boolean; reasons: ConsentReason[] } {
  throw new Error('尚未實作');
}
