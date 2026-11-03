import type { AnswerInput, AnswerSource, QuestionnaireAnswer } from '@templeyard/shared';

// 問卷面板的作答狀態：每題點選項或自己寫，二擇一；再按一次選取的選項取消；來源標籤即時更新

export type DraftAnswer = { choice: string | null; custom: string; photoIds: string[] };

/** 從問卷的答案建立作答狀態 */
export function draftFrom(_answer: QuestionnaireAnswer): DraftAnswer {
  throw new Error('尚未實作');
}

/** 點選項：選取並清掉自己寫；再按一次已選取的選項就取消 */
export function chooseOption(_draft: DraftAnswer, _option: string): DraftAnswer {
  throw new Error('尚未實作');
}

/** 自己寫：有內容時取消選項 */
export function typeCustom(_draft: DraftAnswer, _text: string): DraftAnswer {
  throw new Error('尚未實作');
}

/** 勾選或取消一張照片 */
export function togglePhoto(_draft: DraftAnswer, _photoId: string): DraftAnswer {
  throw new Error('尚未實作');
}

/** 畫面上的來源：和原本的答案相同時用原本的來源；留白是 system；改過是 user */
export function draftSource(_original: QuestionnaireAnswer, _draft: DraftAnswer): AnswerSource {
  throw new Error('尚未實作');
}

/** 送出用的資料：空白的自己寫與沒勾的照片不送 */
export function toAnswerInput(_questionId: string, _draft: DraftAnswer): AnswerInput {
  throw new Error('尚未實作');
}
