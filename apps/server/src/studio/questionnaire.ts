import type { GenerateQuestionnaireInput, Questionnaire, SubmitQuestionnaireInput } from '@templeyard/shared';
import type { AppDatabase } from '../db/client.js';
import type { Clock } from '../series/repository.js';

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

export function createQuestionnaireService(_deps: { db: AppDatabase; clock: Clock }): QuestionnaireService {
  throw new Error('尚未實作');
}
