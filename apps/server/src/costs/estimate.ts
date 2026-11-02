import type { Budget, ConsentReason, CostEstimate, CostItem, WorkflowConfig } from '@templeyard/shared';

/** 預估的模型不在 workflows/models.json */
export class UnknownModelError extends Error {
  constructor(readonly index: number, readonly model: string) {
    super('沒有這個模型的呼叫設定');
    this.name = 'UnknownModelError';
  }
}

/** 依參考單價預估：每項 = 數量 × 單價（四捨五入到整數點）；有任一項單價待實測時總額為 null */
export function estimateCost(items: readonly CostItem[], config: WorkflowConfig): CostEstimate {
  const lines = items.map((item, index) => {
    const model = config.models[item.model];
    if (!model) throw new UnknownModelError(index, item.model);
    const unitCredits = model.price.credits;
    return {
      model: item.model,
      units: item.units,
      unitCredits,
      credits: unitCredits === null ? null : Math.round(item.units * unitCredits),
    };
  });
  const unknown = lines.some((line) => line.credits === null);
  return { credits: unknown ? null : lines.reduce((sum, line) => sum + (line.credits ?? 0), 0), lines };
}

/**
 * 要不要再次同意（02「費用控制」、05「後端強制的規則」）：
 * - 還沒設定單筆門檻 → 每次都要
 * - 這次預估超過單筆門檻 → 要
 * - 已用＋預留＋這次預估超過本支影片上限 → 要
 * - 有模型的單價待實測（無法預估）→ 要
 */
export function checkConsent(
  estimate: CostEstimate,
  budget: Budget,
  config: WorkflowConfig,
): { required: boolean; reasons: ConsentReason[] } {
  const reasons: ConsentReason[] = [];
  const credits = estimate.credits;

  if (budget.threshold === null) {
    reasons.push({ code: 'threshold_unset', message: '還沒設定單筆同意門檻，每次付費生成都要同意' });
  } else if (credits !== null && credits > budget.threshold) {
    reasons.push({ code: 'over_threshold', message: `這次預估 ${credits} 點，超過單筆同意門檻 ${budget.threshold} 點` });
  }
  if (credits !== null && budget.limit !== null && budget.spent + budget.reserved + credits > budget.limit) {
    reasons.push({ code: 'over_limit', message: `加上這次預估 ${credits} 點，會超過這支影片的上限 ${budget.limit} 點` });
  }
  const unknownModels = [...new Set(estimate.lines.filter((line) => line.credits === null).map((line) => line.model))];
  for (const key of unknownModels) {
    const label = config.models[key]?.label ?? key;
    reasons.push({ code: 'price_unknown', message: `${label} 的參考單價還沒實測，無法預估` });
  }
  return { required: reasons.length > 0, reasons };
}
