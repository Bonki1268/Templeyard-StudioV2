import { z } from 'zod';
import { VIDEO_MODELS } from './models.js';
import { QUESTIONNAIRE_QUESTIONS, findQuestion, type QuestionnaireDefaults } from './questionnaire.js';

// 系列設定的「問卷預設值」（03 系列設定分頁、05 questionnaire-defaults）

export type DefaultRow = { questionId: string; title: string; value: string; edited: boolean };

/** 要列出的預設值：依題庫順序，只列有答案且不是每支影片不同的題目；選項優先於自己寫 */
export function defaultRows(defaults: QuestionnaireDefaults | null, edited: readonly string[]): DefaultRow[] {
  if (!defaults) return [];
  return QUESTIONNAIRE_QUESTIONS.flatMap((question) => {
    const entry = defaults[question.id];
    const value = entry?.choice?.trim() || entry?.custom?.trim() || '';
    if (question.perVideo || !value) return [];
    return [{ questionId: question.id, title: question.title, value, edited: edited.includes(question.id) }];
  });
}

/** PATCH 的內容：題目編號 → 新答案；null 表示清除這一題 */
export type DefaultsPatch = Record<string, { choice?: string; custom?: string } | null>;

export type PatchCheck = { ok: true } | { ok: false; message: string };

/** 檢查修改問卷預設值的內容，說明用繁體中文 */
export function validateDefaultsPatch(patch: DefaultsPatch): PatchCheck {
  for (const [questionId, answer] of Object.entries(patch)) {
    const question = findQuestion(questionId);
    if (!question) return { ok: false, message: '找不到這一題' };
    if (question.perVideo) return { ok: false, message: '這一題每支影片各自填寫，不能設為系列預設' };
    if (answer === null) continue;
    const choice = answer.choice?.trim();
    const custom = answer.custom?.trim();
    if (choice && custom) return { ok: false, message: '選項和自己寫只能擇一' };
    if (!choice && !custom) return { ok: false, message: '請選擇或填寫答案' };
    if (choice && !(question.options as readonly string[]).includes(choice)) return { ok: false, message: '這一題沒有這個選項' };
  }
  return { ok: true };
}

/** 套用修改：清除的題目移除，其他覆蓋；不改動傳入的物件 */
export function applyDefaultsPatch(current: QuestionnaireDefaults | null, patch: DefaultsPatch): QuestionnaireDefaults {
  const next: QuestionnaireDefaults = { ...(current ?? {}) };
  for (const [questionId, answer] of Object.entries(patch)) {
    if (answer === null) delete next[questionId];
    else next[questionId] = answer.choice?.trim() ? { choice: answer.choice.trim() } : { custom: answer.custom?.trim() ?? '' };
  }
  return next;
}

/** 這個答案需要角色說話的敘事方式 */
const SPEAKING_NARRATIONS: readonly string[] = ['角色對鏡說話'];

/** 問卷預設的敘事方式需要角色說話，而影片模型沒有原生語音時，要提醒對口型 */
export function needsLipSyncNote(defaults: QuestionnaireDefaults | null, videoModel: string): boolean {
  const narration = defaults?.narration?.choice ?? defaults?.narration?.custom ?? '';
  if (!SPEAKING_NARRATIONS.includes(narration)) return false;
  const model = VIDEO_MODELS.find((m) => m.key === videoModel);
  return model ? !model.nativeAudio : false;
}

/** GET／PATCH /api/series/:id/questionnaire-defaults 的回應 */
export const questionnaireDefaultsViewSchema = z.object({
  rows: z.array(z.object({ questionId: z.string(), title: z.string(), value: z.string(), edited: z.boolean() })),
  sourceVideo: z.object({ id: z.string(), title: z.string() }).nullable(),
});
export type QuestionnaireDefaultsView = z.infer<typeof questionnaireDefaultsViewSchema>;
