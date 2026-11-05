import type { QuestionnaireDefaults } from './questionnaire.js';

// 系列設定的「問卷預設值」（03 系列設定分頁、05 questionnaire-defaults）

export type DefaultRow = { questionId: string; title: string; value: string; edited: boolean };

/** 要列出的預設值：依題庫順序，只列有答案且不是每支影片不同的題目；選項優先於自己寫 */
export function defaultRows(_defaults: QuestionnaireDefaults | null, _edited: readonly string[]): DefaultRow[] {
  throw new Error('尚未實作：defaultRows');
}

/** PATCH 的內容：題目編號 → 新答案；null 表示清除這一題 */
export type DefaultsPatch = Record<string, { choice?: string; custom?: string } | null>;

export type PatchCheck = { ok: true } | { ok: false; message: string };

/** 檢查修改問卷預設值的內容，說明用繁體中文 */
export function validateDefaultsPatch(_patch: DefaultsPatch): PatchCheck {
  throw new Error('尚未實作：validateDefaultsPatch');
}

/** 套用修改：清除的題目移除，其他覆蓋；不改動傳入的物件 */
export function applyDefaultsPatch(_current: QuestionnaireDefaults | null, _patch: DefaultsPatch): QuestionnaireDefaults {
  throw new Error('尚未實作：applyDefaultsPatch');
}

/** 問卷預設的敘事方式需要角色說話，而影片模型沒有原生語音時，要提醒對口型 */
export function needsLipSyncNote(_defaults: QuestionnaireDefaults | null, _videoModel: string): boolean {
  throw new Error('尚未實作：needsLipSyncNote');
}
