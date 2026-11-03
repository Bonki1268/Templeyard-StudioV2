import { defineTool, type AgentTool } from '@templeyard/agent';
import { SHOT_SIZES, costItemSchema, scheduleRegenerationInputSchema, generateQuestionnaireInputSchema, revisePlanInputSchema, templeSearchQuerySchema, type WorkflowConfig } from '@templeyard/shared';
import { z } from 'zod';
import { UnknownModelError, estimateCost } from '../costs/estimate.js';
import type { AppDatabase } from '../db/client.js';
import { findSeries } from '../series/repository.js';
import { listTemples } from '../temples/repository.js';
import { searchTemples } from '../temples/search.js';
import { findVideo } from '../videos/repository.js';
import { StudioError } from './errors.js';
import type { ClipService } from '../clips/service.js';
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

  const tools = [searchTemplesTool, readSeriesTool, generateQuestionnaireTool, estimateCostTool];
  const plans = deps.plans;
  if (!plans || !plans.current(videoId)) return tools;

  const revisePlanTool = defineTool({
    name: REVISE_PLAN_TOOL,
    label: '修改方案',
    subject: '方案修改',
    description:
      '修改這支影片目前的分鏡方案：changes 依序號（seq）列出要改的格子與欄位，只寫要改的欄位。每次修改都會產生新的方案版本。',
    inputSchema: revisePlanInputSchema,
    paid: false,
    run: async (input) => {
      try {
        const { plan, diff } = plans.revise(videoId, input.changes);
        return { ok: true, content: `已存成第 ${plan.version} 版：${diff.summary}`, summary: diff.summary };
      } catch (error: unknown) {
        if (error instanceof StudioError) return { ok: false, content: error.message, summary: error.message };
        throw error;
      }
    },
  });
  return [...tools, revisePlanTool];
}

/** 細修頁的對話（第 10 階段）：只修改這一格 */
export const REVISE_SHOT_TOOL = 'revise_shot';

export function reviseShotTool(plans: PlanService, videoId: string, shotKey: string): AgentTool<unknown> {
  return defineTool({
    name: REVISE_SHOT_TOOL,
    label: '修改這一格',
    subject: '這一格的修改',
    description: '修改使用者正在細修的這一格：只寫要改的欄位。每次修改都會產生新的方案版本。',
    inputSchema: z
      .object({
        durationSec: z.number().int().min(1).max(30),
        shotSize: z.enum(SHOT_SIZES),
        cameraMove: z.string(),
        cameraSpeed: z.string(),
        cameraAngle: z.string(),
        description: z.string(),
        actionStart: z.string(),
        actionEnd: z.string(),
        dialogue: z.string(),
        speaker: z.string(),
        subtitle: z.string(),
      })
      .partial()
      .refine((value) => Object.keys(value).length > 0, { error: '至少要改一個欄位' }),
    paid: false,
    run: async (input) => {
      try {
        const plan = plans.updateShot(videoId, shotKey, input, 'chat_edit');
        return { ok: true, content: `已存成第 ${plan.version} 版：${plan.diff.summary}`, summary: plan.diff.summary };
      } catch (error: unknown) {
        if (error instanceof StudioError) return { ok: false, content: error.message, summary: error.message };
        throw error;
      }
    },
  });
}

/** 對話修改成品（第 12 階段）：安排重生哪幾格；不花錢，使用者看到費用並確認後才重生 */
export const SCHEDULE_REGENERATION_TOOL = 'schedule_regeneration';

export function scheduleRegenerationTool(clips: ClipService, plans: PlanService, workflows: WorkflowConfig, videoId: string): AgentTool<unknown> {
  void clips;
  void plans;
  void workflows;
  void videoId;
  return defineTool({
    name: SCHEDULE_REGENERATION_TOOL,
    label: '安排重生',
    subject: '成品的修改',
    description: '使用者對成品提出修改時，列出要重生的格子序號（shots）與調整指令（instruction）。不會直接重生：使用者看到費用並確認後才重生並重新合成。',
    inputSchema: scheduleRegenerationInputSchema,
    paid: false,
    run: async () => {
      throw new Error('尚未實作');
    },
  });
}
