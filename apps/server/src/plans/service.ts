import type { ClaudeModel } from '@templeyard/agent';
import type { CreatePlanVersionInput, Plan, PlanDiff, PlanResponse, PromptFile, RevisePlanInput, WorkflowConfig, createPlanVersionSchema } from '@templeyard/shared';
import type { z } from 'zod';
import type { AppDatabase } from '../db/client.js';
import type { Clock } from '../series/repository.js';

// 分鏡方案（F8、F9）：Agent 產生第 1 版；每次修改（手動、對話、回到舊版）新增一個版本，shot_key 跨版本不變。

export const STORY_SCRIPT_NODE = 'story-script';

export type CreatePlanVersion = z.output<typeof createPlanVersionSchema>;

export type PlanService = {
  /** 現行方案、版本清單、秒數檢查的規則與定裝版的視角；影片不存在：StudioError 404 */
  get(videoId: string): PlanResponse;
  /** 某一版；找不到：StudioError 404「找不到這個方案版本」 */
  version(videoId: string, version: number): Plan;
  /**
   * Agent 產生第 1 版（story-script 節點＋submit_plan 工具，格式不正確時要求修正一次）：
   * - 問卷還沒送出：409「請先送出問卷」；已經有方案：409「已經有分鏡方案」
   * - 沒有設定 Claude：503；格式修正後仍不正確或呼叫失敗：502
   * - 建立後影片進到 plan 階段
   */
  generate(videoId: string): Promise<Plan>;
  /**
   * 手動修改或回到舊版，新增一個版本：
   * - 還沒有方案：409「還沒有分鏡方案」
   * - baseVersion 不是最新版：409「方案已經有新的版本，請重新整理後再改」
   * - 回到不存在的版本：404「找不到這個方案版本」
   * - 沒有 shotKey 的格子給新的 shotKey；其他格保留原本的 shotKey
   */
  createVersion(videoId: string, input: CreatePlanVersion): Plan;
  /** Agent 的 revise_plan：依序號修改，新增一個 chat_edit 版本；沒有這一格：StudioError 400 */
  revise(videoId: string, changes: RevisePlanInput['changes']): { plan: Plan; diff: PlanDiff };
  /** 現行方案；還沒有時為 null */
  current(videoId: string): Plan | null;
};

export function createPlanService(_deps: {
  db: AppDatabase;
  clock: Clock;
  workflows: WorkflowConfig;
  prompts: ReadonlyMap<string, PromptFile>;
  model: ClaudeModel | null;
  unavailableMessage?: string;
}): PlanService {
  throw new Error('尚未實作');
}

export type { CreatePlanVersionInput };
