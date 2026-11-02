import {
  SLOT_NAMES,
  type McpCall,
  type PromptBindings,
  type PromptFile,
  type SlotName,
  type WorkflowConfig,
  type WorkflowModel,
} from '@templeyard/shared';
import { fill } from './render.js';
import { lookup, present } from './values.js';

// 呼叫綁定：哪個資料寫進 MCP 呼叫的哪個參數（02「生成指令組裝」）

/** 綁定來源除了變數之外，可以用的特殊名稱 */
export const SPECIAL_BINDING_SOURCES = ['output.prompt', 'target.aspectRatio'] as const;

const SLOT_SET = new Set<string>(SLOT_NAMES);

/** 這個節點會用到的工作流程：指定了模型就只看那一個；空白就看同類型、呼叫方式已知的所有模型 */
export function workflowsForPrompt(prompt: PromptFile, config: WorkflowConfig): [string, WorkflowModel][] {
  const entries = Object.entries(config.models);
  if (prompt.target.model) return entries.filter(([key]) => key === prompt.target.model);
  return entries.filter(([, model]) => model.kind === prompt.target.kind && model.status !== 'unknown');
}

/** 儲存前的檢查；回傳中文錯誤訊息（和 prompt-studio/lib/bindings.js 相同） */
export function validateBindings(prompt: PromptFile, config: WorkflowConfig): string[] {
  const bindings: Record<string, string> = prompt.bindings ?? {};
  const slots = Object.keys(bindings);
  if (prompt.target.kind === 'text') return slots.length > 0 ? ['文字節點直接送 Claude，不能有呼叫綁定'] : [];

  const errors: string[] = [];
  if (!bindings.prompt) errors.push('圖片與影片節點要有呼叫綁定 prompt');
  const declared = new Set(prompt.variables.map((v) => v.name));
  const workflows = workflowsForPrompt(prompt, config);
  for (const slot of slots) {
    const source = bindings[slot] ?? '';
    if (!SLOT_SET.has(slot)) {
      errors.push(`呼叫綁定 ${slot} 不是工作流程的位置`);
      continue;
    }
    if (!(SPECIAL_BINDING_SOURCES as readonly string[]).includes(source) && !declared.has(source)) {
      errors.push(`呼叫綁定 ${slot} 用到 ${source}，但變數清單沒有宣告`);
    }
    for (const [, model] of workflows) {
      if (!model.slots?.[slot as SlotName]) errors.push(`呼叫綁定 ${slot}：${model.label} 的工作流程沒有這個位置`);
    }
  }
  return errors;
}

export class CallBuildError extends Error {
  override name = 'CallBuildError';
}

function setAt(target: Record<string, unknown>, path: readonly string[], value: unknown) {
  let node = target;
  for (const key of path.slice(0, -1)) {
    const next = node[key];
    if (typeof next !== 'object' || next === null || Array.isArray(next)) node[key] = {};
    node = node[key] as Record<string, unknown>;
  }
  node[path.at(-1) ?? ''] = value;
}

/**
 * 依工作流程與呼叫綁定組出 MCP 呼叫：
 * - 從 args 複製一份，再把每個 slot 的值寫到它的 paths
 * - slot 有 template 時先套用（例如 Gemini 把秒數與比例寫進指令）
 * - 有 seed slot、但沒有綁定時，用 options.seed
 * - 值不在 allowed、超出 min／max，或模型的呼叫方式還不知道時丟出 CallBuildError
 */
export function buildMcpCall(input: {
  modelKey: string;
  config: WorkflowConfig;
  bindings: PromptBindings;
  /** 綁定來源的值：output.prompt、target.aspectRatio 與各變數（巢狀物件，點號取值） */
  values: Record<string, unknown>;
  seed: number;
}): McpCall {
  const model = input.config.models[input.modelKey];
  if (!model) throw new CallBuildError(`沒有這個模型的呼叫設定：${input.modelKey}`);
  if (model.status === 'unknown' || !model.tool || !model.slots) {
    throw new CallBuildError(`${model.label} 的呼叫方式還沒確認，不能生成`);
  }

  // 先取出每個綁定的值，並檢查範圍
  const slotValues: Partial<Record<SlotName, unknown>> = {};
  for (const [slot, source] of Object.entries(input.bindings) as [SlotName, string][]) {
    const definition = model.slots[slot];
    if (!definition) continue;
    const value = lookup(input.values, source);
    if (!present(value)) throw new CallBuildError(`呼叫綁定 ${slot} 沒有值（${source}）`);
    if (definition.allowed && !definition.allowed.includes(String(value))) {
      throw new CallBuildError(`${model.label} 不支援畫面比例 ${String(value)}`);
    }
    if (definition.min !== undefined || definition.max !== undefined) {
      const number = Number(value);
      if (!Number.isFinite(number) || number < (definition.min ?? -Infinity) || number > (definition.max ?? Infinity)) {
        throw new CallBuildError(`${model.label} 的秒數要在 ${definition.min ?? 0}～${definition.max ?? '∞'} 秒之間`);
      }
    }
    slotValues[slot] = value;
  }
  if (model.slots.seed && slotValues.seed === undefined) slotValues.seed = input.seed;

  const args = structuredClone(model.args ?? {});
  for (const [slot, value] of Object.entries(slotValues) as [SlotName, unknown][]) {
    const definition = model.slots[slot];
    if (!definition) continue;
    const written = definition.template ? fill(definition.template, slotValues as Record<string, unknown>) : value;
    for (const path of definition.paths) setAt(args, path, written);
  }
  return { tool: model.tool, args };
}
