import { defineTool, type AgentTool } from '@templeyard/agent';
import { costItemSchema, generateQuestionnaireInputSchema, templeSearchQuerySchema, type WorkflowConfig } from '@templeyard/shared';
import { z } from 'zod';
import { UnknownModelError, estimateCost } from '../costs/estimate.js';
import type { AppDatabase } from '../db/client.js';
import { findSeries } from '../series/repository.js';
import { listTemples } from '../temples/repository.js';
import { searchTemples } from '../temples/search.js';
import { findVideo } from '../videos/repository.js';
import { StudioError } from './errors.js';
import type { PlanService } from '../plans/service.js';
import type { QuestionnaireService } from './questionnaire.js';

// 創作 Agent 在第 6 階段可以用的工具；都不花錢（付費工具在之後的階段加入，會經過同意憑證檢查）

export const AGENT_TOOL_NAMES = ['search_temples', 'read_series', 'generate_questionnaire', 'estimate_cost'] as const;

/** 方案建立後才有：依序號修改分鏡方案（不花錢） */
export const REVISE_PLAN_TOOL = 'revise_plan';

/**
 * - search_temples { q }：搜尋寺廟資料庫（只讀），最多 5 筆，每筆帶上來源標記
 * - read_series {}：這支影片的系列設定與系列問卷預設值
 * - generate_questionnaire { questionIds, prefill }：開啟問卷（questionnaires.open）
 * - estimate_cost { items }：依參考單價預估費用；單價待實測時說明
 * - revise_plan { changes }：這支影片已有分鏡方案時才有；依序號修改，摘要列出改了哪幾格
 */
export function createAgentTools(deps: {
  db: AppDatabase;
  videoId: string;
  questionnaires: QuestionnaireService;
  workflows: WorkflowConfig;
  plans?: PlanService;
}): AgentTool<unknown>[] {
  const { db, videoId, questionnaires, workflows } = deps;

  const searchTemplesTool = defineTool({
    name: 'search_temples',
    label: '查詢寺廟',
    subject: '寺廟查詢',
    description: '以廟名、行政區或主祀神明搜尋新北市寺廟資料庫（只讀）。結果最多 5 筆，每筆標示來源。',
    inputSchema: z.object({ q: z.string().trim().min(1).max(100) }),
    paid: false,
    run: async (input) => {
      const rows = searchTemples(listTemples(db, { includeInactive: false }), templeSearchQuerySchema.parse({ q: input.q, limit: 5 }));
      if (rows.length === 0) return { ok: true, content: '寺廟資料庫裡沒有符合的寺廟', summary: `查詢「${input.q}」：沒有結果` };
      const lines = rows.map(
        (row) =>
          `- ${row.name}（${row.district}，主祀${row.deity}${row.foundedYear === null ? '' : `，創建於 ${row.foundedYear} 年`}；地址：${row.address}；來源：寺廟資料庫）`,
      );
      return { ok: true, content: lines.join('\n'), summary: `查詢「${input.q}」：${rows.length} 筆` };
    },
  });

  const readSeriesTool = defineTool({
    name: 'read_series',
    label: '讀取系列設定',
    subject: '系列設定',
    description: '讀取這支影片所屬系列的設定：名稱、整體視覺風格、影片秒數、影片方向、預設模型與系列問卷預設值。',
    inputSchema: z.object({}),
    paid: false,
    run: async () => {
      const video = findVideo(db, videoId);
      const found = video ? findSeries(db, video.seriesId) : null;
      if (!found) return { ok: false, content: '找不到這支影片的系列', summary: '找不到這支影片的系列' };
      const content = JSON.stringify({
        name: found.name,
        visualStyle: found.visualStyle,
        durationSec: found.durationSec,
        direction: found.direction,
        defaultImageModel: found.defaultImageModel,
        defaultVideoModel: found.defaultVideoModel,
        questionnaireDefaults: found.questionnaireDefaults,
      });
      return { ok: true, content, summary: `讀取「${found.name}」的設定` };
    },
  });

  const generateQuestionnaireTool = defineTool({
    name: 'generate_questionnaire',
    label: '開啟問卷',
    subject: '問卷',
    description:
      '開啟這支影片的設定問卷。questionIds 從題庫挑要問的題目（題庫代號見系統指令）；prefill 依使用者這次說的話預填答案：選項題用 choice（要是題目的選項之一），其他用 custom。沒說到的題目不要預填。',
    inputSchema: generateQuestionnaireInputSchema,
    paid: false,
    run: async (input) => {
      try {
        const questionnaire = questionnaires.open(videoId, input);
        return { ok: true, content: '問卷已開啟，使用者會在右邊的面板作答', summary: `開啟問卷，共 ${questionnaire.answers.length} 題` };
      } catch (error: unknown) {
        if (error instanceof StudioError) return { ok: false, content: error.message, summary: error.message };
        throw error;
      }
    },
  });

  const estimateCostTool = defineTool({
    name: 'estimate_cost',
    label: '預估費用',
    subject: '費用預估',
    description: '依參考單價預估接下來的生成要花多少點數。items 是模型代號與數量（圖片張數或影片秒數）。只預估，不會生成。',
    inputSchema: z.object({ items: z.array(costItemSchema).min(1).max(50) }),
    paid: false,
    run: async (input) => {
      let estimate;
      try {
        estimate = estimateCost(input.items, workflows);
      } catch (error: unknown) {
        if (error instanceof UnknownModelError) return { ok: false, content: error.message, summary: error.message };
        throw error;
      }
      const lines = estimate.lines.map((line) => {
        const label = workflows.models[line.model]?.label ?? line.model;
        return line.credits === null ? `- ${label} × ${line.units}：單價待實測，無法預估` : `- ${label} × ${line.units}：約 ${line.credits} 點`;
      });
      const total = estimate.credits === null ? '合計：有模型的單價待實測，無法預估總額' : `合計：約 ${estimate.credits} 點`;
      return { ok: true, content: [...lines, total].join('\n'), summary: estimate.credits === null ? '單價待實測，無法預估' : `約 ${estimate.credits} 點` };
    },
  });

  return [searchTemplesTool, readSeriesTool, generateQuestionnaireTool, estimateCostTool];
}
