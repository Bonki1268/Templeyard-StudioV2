import type { AgentTool } from '@templeyard/agent';
import type { WorkflowConfig } from '@templeyard/shared';
import type { AppDatabase } from '../db/client.js';
import type { QuestionnaireService } from './questionnaire.js';

// 創作 Agent 在第 6 階段可以用的工具；都不花錢（付費工具在之後的階段加入，會經過同意憑證檢查）

export const AGENT_TOOL_NAMES = ['search_temples', 'read_series', 'generate_questionnaire', 'estimate_cost'] as const;

/**
 * - search_temples { q }：搜尋寺廟資料庫（只讀），最多 5 筆，每筆帶上來源標記
 * - read_series {}：這支影片的系列設定與系列問卷預設值
 * - generate_questionnaire { questionIds, prefill }：開啟問卷（questionnaires.open）
 * - estimate_cost { items }：依參考單價預估費用；單價待實測時說明
 */
export function createAgentTools(_deps: {
  db: AppDatabase;
  videoId: string;
  questionnaires: QuestionnaireService;
  workflows: WorkflowConfig;
}): AgentTool<unknown>[] {
  throw new Error('尚未實作');
}
