import {
  QuestionnaireInputError,
  answerSummaryLines,
  defaultsFromAnswers,
  prefillAnswers,
  questionnaireDefaultsSchema,
  resolveSubmittedAnswers,
  type GenerateQuestionnaireInput,
  type Questionnaire,
  type QuestionnaireDefaults,
  type SubmitQuestionnaireInput,
  type Video,
} from '@templeyard/shared';
import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { series, videos } from '../db/schema.js';
import { listPhotosForVideo } from '../photos/repository.js';
import { findSeries, type Clock } from '../series/repository.js';
import { seriesSettingsForVideo } from '../series/settings.js';
import { findVideo } from '../videos/repository.js';
import { QUESTIONNAIRE_ALREADY_SUBMITTED, QUESTIONNAIRE_NOT_OPENED, StudioError, VIDEO_NOT_FOUND } from './errors.js';
import { findQuestionnaire, insertChatMessage, insertQuestionnaire, updateQuestionnaire } from './repository.js';

// 設定問卷（F7）：Agent 開啟問卷、使用者送出；系列第一支送出問卷的影片寫入系列問卷預設值。

export type QuestionnaireService = {
  /** 影片不存在：StudioError 404；還沒開啟問卷時回傳 null */
  get(videoId: string): Questionnaire | null;
  /**
   * Agent 的 generate_questionnaire：依預填順序建立（或在送出前換掉）這支影片的問卷，影片階段由 chat 進到 questionnaire。
   * 已送出：StudioError 409「問卷已送出，不能重新產生」
   */
  open(videoId: string, input: GenerateQuestionnaireInput): Questionnaire;
  /**
   * 送出問卷：
   * - 還沒開啟問卷：StudioError 409「Agent 還沒開啟問卷」
   * - 答案不正確：StudioError 400（訊息同 resolveSubmittedAnswers）
   * - 寫入 submitted_at；系列問卷預設值是空的時寫入（排除每支影片不同的題目）
   * - 對話記下一則使用者訊息：「送出問卷」與答案摘要
   */
  submit(videoId: string, input: SubmitQuestionnaireInput): { questionnaire: Questionnaire; seriesDefaultsSaved: boolean };
};

/** 系列問卷預設值：格式不正確時當成沒有，不讓問卷打不開 */
function readDefaults(value: unknown): QuestionnaireDefaults | null {
  const parsed = questionnaireDefaultsSchema.safeParse(value);
  return parsed.success && Object.keys(parsed.data).length > 0 ? parsed.data : null;
}

export function createQuestionnaireService(deps: { db: AppDatabase; clock: Clock }): QuestionnaireService {
  const { db, clock } = deps;

  function requireVideo(videoId: string): Video {
    const video = findVideo(db, videoId);
    if (!video) throw new StudioError(404, VIDEO_NOT_FOUND);
    return video;
  }

  function requireSeries(seriesId: string) {
    const found = findSeries(db, seriesId);
    if (!found) throw new Error(`影片的系列不存在：${seriesId}`);
    return found;
  }

  return {
    get(videoId) {
      requireVideo(videoId);
      return findQuestionnaire(db, videoId);
    },

    open(videoId, input) {
      const video = requireVideo(videoId);
      const existing = findQuestionnaire(db, videoId);
      if (existing?.submittedAt) throw new StudioError(409, QUESTIONNAIRE_ALREADY_SUBMITTED);
      requireSeries(video.seriesId);
      // 預填用建立影片時保存的系列問卷預設值（修改系列只影響之後新增的影片）
      const saved = seriesSettingsForVideo(db, video);
      const answers = prefillAnswers({
        tool: input,
        seriesDefaults: readDefaults(saved?.questionnaireDefaults ?? null),
      });
      return db.transaction(() => {
        const questionnaire = existing
          ? updateQuestionnaire(db, existing.id, { answers })
          : insertQuestionnaire(db, { id: clock.newId(), videoId, answers });
        if (video.stage === 'chat') {
          db.update(videos).set({ stage: 'questionnaire', updatedAt: clock.now().toISOString() }).where(eq(videos.id, videoId)).run();
        }
        return questionnaire;
      });
    },

    submit(videoId, input) {
      const video = requireVideo(videoId);
      const existing = findQuestionnaire(db, videoId);
      if (!existing) throw new StudioError(409, QUESTIONNAIRE_NOT_OPENED);
      const photoIds = listPhotosForVideo(db, video).map((photo) => photo.id);
      let answers;
      try {
        answers = resolveSubmittedAnswers(existing.answers, input.answers, photoIds);
      } catch (error: unknown) {
        if (error instanceof QuestionnaireInputError) throw new StudioError(400, error.message);
        throw error;
      }
      const seriesRow = requireSeries(video.seriesId);
      const defaults = defaultsFromAnswers(answers);
      const saveDefaults = readDefaults(seriesRow.questionnaireDefaults) === null && Object.keys(defaults).length > 0;
      const now = clock.now().toISOString();
      return db.transaction(() => {
        const questionnaire = updateQuestionnaire(db, existing.id, { answers, submittedAt: now });
        if (saveDefaults) db.update(series).set({ questionnaireDefaults: defaults, updatedAt: now }).where(eq(series.id, seriesRow.id)).run();
        insertChatMessage(db, {
          id: clock.newId(),
          videoId,
          role: 'user',
          content: ['送出問卷', ...answerSummaryLines(answers)].join('\n'),
          toolCalls: [],
          createdAt: now,
        });
        return { questionnaire, seriesDefaultsSaved: saveDefaults };
      });
    },
  };
}
