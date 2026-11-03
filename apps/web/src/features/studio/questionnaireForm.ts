import type { AnswerInput, AnswerSource, QuestionnaireAnswer } from '@templeyard/shared';

// 問卷面板的作答狀態：每題點選項或自己寫，二擇一；再按一次選取的選項取消；來源標籤即時更新

export type DraftAnswer = { choice: string | null; custom: string; photoIds: string[] };

/** 從問卷的答案建立作答狀態 */
export function draftFrom(answer: QuestionnaireAnswer): DraftAnswer {
  return { choice: answer.choice ?? null, custom: answer.custom ?? '', photoIds: [...(answer.photoIds ?? [])] };
}

/** 點選項：選取並清掉自己寫；再按一次已選取的選項就取消 */
export function chooseOption(draft: DraftAnswer, option: string): DraftAnswer {
  return { ...draft, choice: draft.choice === option ? null : option, custom: '' };
}

/** 自己寫：有內容時取消選項 */
export function typeCustom(draft: DraftAnswer, text: string): DraftAnswer {
  return { ...draft, custom: text, choice: text.trim() ? null : draft.choice };
}

/** 勾選或取消一張照片 */
export function togglePhoto(draft: DraftAnswer, photoId: string): DraftAnswer {
  const photoIds = draft.photoIds.includes(photoId) ? draft.photoIds.filter((id) => id !== photoId) : [...draft.photoIds, photoId];
  return { ...draft, photoIds };
}

/** 送出用的資料：空白的自己寫與沒勾的照片不送 */
export function toAnswerInput(questionId: string, draft: DraftAnswer): AnswerInput {
  const custom = draft.custom.trim();
  if (draft.choice !== null) return { questionId, choice: draft.choice };
  if (custom) return { questionId, custom };
  if (draft.photoIds.length > 0) return { questionId, photoIds: draft.photoIds };
  return { questionId };
}

/** 畫面上的來源：和原本的答案相同時用原本的來源；留白是 system；改過是 user */
export function draftSource(original: QuestionnaireAnswer, draft: DraftAnswer): AnswerSource {
  const input = toAnswerInput(original.questionId, draft);
  if (input.choice === undefined && input.custom === undefined && input.photoIds === undefined) return 'system';
  const same =
    input.choice === original.choice &&
    input.custom === original.custom &&
    JSON.stringify([...(input.photoIds ?? [])].sort()) === JSON.stringify([...(original.photoIds ?? [])].sort());
  return same ? original.source : 'user';
}
