import { ClaudeCallError, StructuredOutputError, requestToolInput, type ClaudeModel } from '@templeyard/agent';
import { renderPrompt } from '@templeyard/prompts';
import {
  MAX_VIDEO_SEC,
  PlanInputError,
  SPEECH_RATE_CHARS_PER_SEC,
  answerSummaryLines,
  applyRevision,
  diffShots,
  estimateDialogueSec,
  planOutputSchema,
  planTargetSec,
  shotInputSchema,
  shotsFromOutput,
  videoModelLabel,
  viewName,
  withTimeline,
  type Plan,
  type PlanDiff,
  type planResponseSchema,
  type PlanSource,
  type PromptFile,
  type RevisePlanInput,
  type Shot,
  type ShotDraft,
  type Video,
  type WorkflowConfig,
  type createPlanVersionSchema,
} from '@templeyard/shared';
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { AppDatabase } from '../db/client.js';
import { videos } from '../db/schema.js';
import { listPhotosForVideo } from '../photos/repository.js';
import { findSeries, type Clock } from '../series/repository.js';
import { StudioError, VIDEO_NOT_FOUND } from '../studio/errors.js';
import { findQuestionnaire } from '../studio/repository.js';
import { listViews } from '../templeBoards/repository.js';
import { findTemple } from '../temples/repository.js';
import { findVideo } from '../videos/repository.js';
import type { CharacterService } from '../characters/service.js';
import { findCurrentPlan, findPlanVersion, insertPlan, knownShotKeys, listPlanVersions } from './repository.js';

// 分鏡方案（F8、F9）：Agent 產生第 1 版；每次修改（手動、對話、回到舊版）新增一個版本，shot_key 跨版本不變。

export const STORY_SCRIPT_NODE = 'story-script';

export type CreatePlanVersion = z.output<typeof createPlanVersionSchema>;

export type PlanService = {
  /** 現行方案、版本清單、秒數檢查的規則與定裝版的視角；影片不存在：StudioError 404 */
  get(videoId: string): z.input<typeof planResponseSchema>;
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
  /** 把用到 from 視角的格子改用 to（補充視角確認後）；有改動時新增一個 user_edit 版本，沒有方案或沒有改動時回傳 null */
  replaceViewKey(videoId: string, from: string, to: string): Plan | null;
};

const SUBMIT_PLAN_TOOL = {
  name: 'submit_plan',
  description: '交出這支影片的分鏡方案（格式依系統指令與輸出格式）。',
  schema: planOutputSchema,
};

export function createPlanService(deps: {
  db: AppDatabase;
  clock: Clock;
  workflows: WorkflowConfig;
  prompts: ReadonlyMap<string, PromptFile>;
  model: ClaudeModel | null;
  /** 第 8 階段：方案的角色名稱與角色編號互轉 */
  characters?: CharacterService;
  unavailableMessage?: string;
}): PlanService {
  const { db, clock, workflows } = deps;

  function requireVideo(videoId: string): Video {
    const video = findVideo(db, videoId);
    if (!video) throw new StudioError(404, VIDEO_NOT_FOUND);
    return video;
  }

  function lengthChoice(videoId: string): string | null {
    return findQuestionnaire(db, videoId)?.answers.find((answer) => answer.questionId === 'length')?.choice ?? null;
  }

  function rulesFor(video: Video) {
    const seriesRow = findSeries(db, video.seriesId);
    return {
      targetSec: planTargetSec(lengthChoice(video.id), seriesRow?.durationSec ?? MAX_VIDEO_SEC),
      minGenerationSec: workflows.models[video.videoModel]?.slots?.durationSec?.min ?? null,
      videoModelLabel: videoModelLabel(video.videoModel),
    };
  }

  function viewsFor(video: Video) {
    return video.templeBoardVersionId ? listViews(db, video.templeBoardVersionId).map((v) => ({ viewKey: v.viewKey, viewName: v.viewName })) : [];
  }

  /** 卡片排好時間、補上 shotKey 與對白估時；不認得或重複的 shotKey 給新的 */
  function placeShots(videoId: string, drafts: readonly ShotDraft[]): (Shot & { id: string })[] {
    const known = knownShotKeys(db, videoId);
    const used = new Set<string>();
    return withTimeline(drafts).map(({ shotKey, ...draft }) => {
      const key = shotKey && known.has(shotKey) && !used.has(shotKey) ? shotKey : clock.newId();
      used.add(key);
      return { ...draft, id: clock.newId(), shotKey: key, dialogueEstimateSec: estimateDialogueSec(draft.dialogue) };
    });
  }

  function save(videoId: string, input: { version: number; styleNote: string; source: PlanSource; drafts: readonly ShotDraft[]; previous: readonly Shot[]; revertedFrom?: number }): Plan {
    const rows = placeShots(videoId, input.drafts);
    const diff = input.previous.length === 0 ? { changedShotKeys: rows.map((r) => r.shotKey), summary: `Agent 產生第 ${input.version} 版` } : diffShots(input.previous, rows.map(({ id: _id, ...shot }) => shot));
    const now = clock.now().toISOString();
    db.transaction(() => {
      insertPlan(
        db,
        { id: clock.newId(), videoId, version: input.version, styleNote: input.styleNote, source: input.source, diff: { ...diff, ...(input.revertedFrom ? { revertedFrom: input.revertedFrom } : {}) }, createdAt: now },
        rows,
      );
      if (input.source === 'agent') db.update(videos).set({ stage: 'plan', updatedAt: now }).where(eq(videos.id, videoId)).run();
    });
    const saved = findPlanVersion(db, videoId, input.version);
    if (!saved) throw new Error('方案存檔失敗');
    return saved;
  }

  function draftsOf(plan: Plan): ShotDraft[] {
    return plan.shots.map(({ seq: _seq, startSec: _start, dialogueEstimateSec: _estimate, ...rest }) => shotInputSchema.parse(rest));
  }

  /** story-script 節點的變數（prompt-studio/prompts/story-script.json） */
  function storyVariables(video: Video): Record<string, unknown> {
    const temple = findTemple(db, video.templeId);
    const seriesRow = findSeries(db, video.seriesId);
    if (!temple || !seriesRow) throw new Error('影片的寺廟或系列不存在');
    const answers = findQuestionnaire(db, video.id)?.answers ?? [];
    const story = answers.find((answer) => answer.questionId === 'story')?.custom ?? video.creativeInput ?? '';
    const rules = rulesFor(video);
    const photos = listPhotosForVideo(db, video).map((photo, index) => `照片 ${index + 1}（${photo.viewKey ? viewName(photo.viewKey) : '沒有指定視角'}）`);
    return {
      temple: {
        name: temple.name,
        district: temple.district,
        deity: temple.deity,
        builtYear: temple.foundedYear === null ? '不詳' : String(temple.foundedYear),
        address: temple.address,
        history: video.userTempleNotes.trim() || '沒有',
      },
      templeViews: viewsFor(video).map((v) => `${v.viewKey}：${v.viewName}`).join('、') || '沒有',
      series: { style: seriesRow.visualStyle, direction: seriesRow.direction, duration: String(rules.targetSec) },
      shotCountHint: '',
      // 角色定裝版在第 8 階段；目前沒有系列共同角色
      characters: '沒有',
      photos: photos.join('、') || '沒有',
      questionnaire: answerSummaryLines(answers).join('；'),
      video: { model: rules.videoModelLabel, minSeconds: rules.minGenerationSec === null ? '待實測' : String(rules.minGenerationSec) },
      speechRate: String(SPEECH_RATE_CHARS_PER_SEC),
      story,
      instruction: '',
    };
  }

  return {
    get(videoId) {
      const video = requireVideo(videoId);
      return { plan: findCurrentPlan(db, videoId), versions: listPlanVersions(db, videoId), rules: rulesFor(video), views: viewsFor(video) };
    },

    version(videoId, version) {
      requireVideo(videoId);
      const plan = findPlanVersion(db, videoId, version);
      if (!plan) throw new StudioError(404, VERSION_NOT_FOUND);
      return plan;
    },

    async generate(videoId) {
      const video = requireVideo(videoId);
      if (!findQuestionnaire(db, videoId)?.submittedAt) throw new StudioError(409, '請先送出問卷');
      if (findCurrentPlan(db, videoId)) throw new StudioError(409, '已經有分鏡方案');
      if (!deps.model) throw new StudioError(503, deps.unavailableMessage ?? '還沒設定 Claude，不能產生分鏡方案');
      const prompt = deps.prompts.get(STORY_SCRIPT_NODE);
      if (!prompt) throw new Error(`找不到生成指令：${STORY_SCRIPT_NODE}`);
      const rendered = renderPrompt(prompt, storyVariables(video));
      let output;
      try {
        const result = await requestToolInput({
          model: deps.model,
          system: rendered.request.system,
          user: rendered.request.messages.map((m) => m.content).join('\n\n'),
          tool: SUBMIT_PLAN_TOOL,
          subject: '分鏡方案',
          maxTokens: 8000,
        });
        output = result.value;
      } catch (error: unknown) {
        if (error instanceof StructuredOutputError || error instanceof ClaudeCallError) throw new StudioError(502, error.message);
        throw error;
      }
      return save(videoId, { version: 1, styleNote: output.styleNote, source: 'agent', drafts: shotsFromOutput(output), previous: [] });
    },

    createVersion(videoId, input) {
      requireVideo(videoId);
      const current = findCurrentPlan(db, videoId);
      if (!current) throw new StudioError(409, NO_PLAN);
      if (input.baseVersion !== current.version) throw new StudioError(409, '方案已經有新的版本，請重新整理後再改');
      if (input.revertTo !== undefined) {
        const target = findPlanVersion(db, videoId, input.revertTo);
        if (!target) throw new StudioError(404, VERSION_NOT_FOUND);
        return save(videoId, { version: current.version + 1, styleNote: target.styleNote, source: 'revert', drafts: draftsOf(target), previous: current.shots, revertedFrom: target.version });
      }
      return save(videoId, {
        version: current.version + 1,
        styleNote: input.styleNote ?? current.styleNote,
        source: 'user_edit',
        drafts: input.shots ?? [],
        previous: current.shots,
      });
    },

    revise(videoId, changes) {
      requireVideo(videoId);
      const current = findCurrentPlan(db, videoId);
      if (!current) throw new StudioError(409, NO_PLAN);
      let drafts: ShotDraft[];
      try {
        drafts = applyRevision(draftsOf(current), changes);
      } catch (error: unknown) {
        if (error instanceof PlanInputError) throw new StudioError(400, error.message);
        throw error;
      }
      const plan = save(videoId, { version: current.version + 1, styleNote: current.styleNote, source: 'chat_edit', drafts, previous: current.shots });
      return { plan, diff: plan.diff };
    },

    current(videoId) {
      return findCurrentPlan(db, videoId);
    },

    replaceViewKey() {
      throw new Error('尚未實作');
    },
  };
}

const NO_PLAN = '還沒有分鏡方案';
const VERSION_NOT_FOUND = '找不到這個方案版本';
