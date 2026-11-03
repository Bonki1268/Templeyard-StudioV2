import {
  AssistOutputError,
  ClaudeCallError,
  buildAssistRequest,
  copyPolishVariables,
  parseAssistOutput,
  type AssistContext,
  type ClaudeModel,
} from '@templeyard/agent';
import { renderPrompt } from '@templeyard/prompts';
import { findAssistField, findQuestion, viewName, type AssistLog, type PromptFile, type assistRequestSchema } from '@templeyard/shared';
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { AppDatabase } from '../db/client.js';
import { aiAssistLogs, type AiAssistLogRow } from '../db/schema.js';
import { findSeries, type Clock } from '../series/repository.js';
import { StudioError, VIDEO_NOT_FOUND } from '../studio/errors.js';
import { findTemple } from '../temples/repository.js';
import { findVideo } from '../videos/repository.js';

// AI 輔助撰寫（F18）：產生建議並記錄；只有按「採用」才記為已採用。不會送出或觸發任何生成。

export type AssistInput = z.output<typeof assistRequestSchema>;

export type AssistService = {
  /**
   * 產生建議：
   * - 欄位不在清單：StudioError 400「這個欄位不能使用 AI 幫我寫」
   * - 影片的欄位沒有指定影片：400「這個欄位要指定影片」
   * - 影片不存在：404「找不到這支影片」；系列不存在：404「找不到這個系列」
   * - 沒有設定 Claude：503
   * - 呼叫 Claude 失敗或格式不正確：502，說明原因
   * - 有 node 的欄位用 Prompt Studio 的文字節點，其他用通用的輔助撰寫指令
   * - 影片的欄位，紀錄的 series_id 是這支影片的系列
   */
  suggest(input: AssistInput): Promise<AssistLog>;
  /** 找不到：StudioError 404「找不到這筆 AI 建議」 */
  find(id: string): AssistLog;
  adopt(id: string): AssistLog;
};

const NOT_FOUND = '找不到這筆 AI 建議';

function toLog(row: AiAssistLogRow): AssistLog {
  return {
    id: row.id,
    seriesId: row.seriesId,
    videoId: row.videoId,
    field: row.field,
    userInput: row.userInput,
    suggestion: row.suggestion,
    adopted: row.adopted,
    createdAt: row.createdAt,
  };
}

export function createAssistService(deps: {
  db: AppDatabase;
  clock: Clock;
  prompts: ReadonlyMap<string, PromptFile>;
  model: ClaudeModel | null;
  unavailableMessage?: string;
}): AssistService {
  const { db, clock } = deps;

  /** 欄位、影片、系列的檢查，組出撰寫用的資料 */
  function contextFor(input: AssistInput): { context: AssistContext; seriesId: string | null; videoId: string | null } {
    const field = findAssistField(input.field);
    if (!field) throw new StudioError(400, '這個欄位不能使用 AI 幫我寫');
    if (field.scope === 'video' && !input.videoId) throw new StudioError(400, '這個欄位要指定影片');
    const video = input.videoId ? findVideo(db, input.videoId) : null;
    if (input.videoId && !video) throw new StudioError(404, VIDEO_NOT_FOUND);
    const seriesId = video?.seriesId ?? input.seriesId ?? null;
    const seriesRow = seriesId ? findSeries(db, seriesId) : null;
    if (seriesId && !seriesRow) throw new StudioError(404, '找不到這個系列');
    const temple = video ? findTemple(db, video.templeId) : null;
    const viewKey = input.target.viewKey;
    const questionId = input.target.questionId;
    const context: AssistContext = {
      field,
      userInput: input.userInput,
      temple: temple ? { name: temple.name, district: temple.district, deity: temple.deity, builtYear: temple.foundedYear } : null,
      userTempleNotes: video?.userTempleNotes ?? '',
      series: seriesRow ? { visualStyle: seriesRow.visualStyle, direction: seriesRow.direction, durationSec: seriesRow.durationSec } : null,
      creativeInput: video?.creativeInput ?? null,
      viewName: viewKey ? viewName(viewKey) : null,
      questionTitle: questionId ? (findQuestion(questionId)?.title ?? null) : null,
    };
    return { context, seriesId, videoId: video?.id ?? null };
  }

  /** 有 Prompt Studio 節點的欄位用節點的指令；缺少必填變數時改用通用指令 */
  function requestFor(context: AssistContext): { system: string; user: string; kind: 'generic' | 'copy-polish' } {
    const node = context.field.node ? deps.prompts.get(context.field.node) : undefined;
    if (node && context.field.node === 'copy-polish') {
      const variables = { ...copyPolishVariables(context), story: context.userInput.trim() || (context.creativeInput ?? '') };
      const rendered = renderPrompt(node, variables);
      if (rendered.missing.length === 0) {
        return { system: rendered.request.system, user: rendered.request.messages.map((m) => m.content).join('\n\n'), kind: 'copy-polish' };
      }
    }
    return { ...buildAssistRequest(context), kind: 'generic' };
  }

  function find(id: string): AssistLog {
    const row = db.select().from(aiAssistLogs).where(eq(aiAssistLogs.id, id)).get();
    if (!row) throw new StudioError(404, NOT_FOUND);
    return toLog(row);
  }

  return {
    async suggest(input) {
      const { context, seriesId, videoId } = contextFor(input);
      if (!deps.model) throw new StudioError(503, deps.unavailableMessage ?? '還沒設定 Claude，不能使用 AI 幫我寫');
      const request = requestFor(context);
      let suggestion: string;
      try {
        const response = await deps.model.create({ system: request.system, messages: [{ role: 'user', content: request.user }], maxTokens: 2000 });
        const text = response.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
        suggestion = parseAssistOutput(text, request.kind);
      } catch (error: unknown) {
        if (error instanceof ClaudeCallError || error instanceof AssistOutputError) throw new StudioError(502, error.message);
        throw error;
      }
      const row = db
        .insert(aiAssistLogs)
        .values({
          id: clock.newId(),
          seriesId,
          videoId,
          field: context.field.key,
          userInput: input.userInput,
          suggestion,
          adopted: false,
          createdAt: clock.now().toISOString(),
        })
        .returning()
        .get();
      return toLog(row);
    },

    find,

    adopt(id) {
      find(id);
      db.update(aiAssistLogs).set({ adopted: true }).where(eq(aiAssistLogs.id, id)).run();
      return find(id);
    },
  };
}
