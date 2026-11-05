import type { QuestionnaireDefaults } from '@templeyard/shared';
import type { SeriesFormState } from './seriesForm';

// 系列設定分頁的表單狀態：哪些欄位改了、底部操作列的說明、費用欄位的檢查（03 系列設定分頁）

export type CostFormState = { videoLimit: string; threshold: string };

export type SettingsFormState = {
  series: SeriesFormState;
  /** 問卷預設值的修改：題目編號 → 新答案；null 表示清除 */
  defaultsPatch: Record<string, { choice?: string; custom?: string } | null>;
  cost: CostFormState;
};

/** 費用欄位：空白代表沒有設定；整數點數；其他回傳說明 */
export function parseCreditsField(_text: string, _label: string): { ok: true; value: number | null } | { ok: false; message: string } {
  throw new Error('尚未實作：parseCreditsField');
}

/** 和已儲存的內容比對，列出改過的項目（依畫面順序；問卷預設值逐題列出為「問卷預設值「語氣」」） */
export function changedItems(_saved: SettingsFormState, _current: SettingsFormState, _defaults: QuestionnaireDefaults | null): string[] {
  throw new Error('尚未實作：changedItems');
}

/** 還沒填好的欄位（必填欄位空白、費用格式不正確） */
export function blockingItems(_current: SettingsFormState): string[] {
  throw new Error('尚未實作：blockingItems');
}

/** 底部操作列左側的說明：有待處理的優先；其次是未儲存的變更；都沒有時說沒有 */
export function barMessage(_blocking: readonly string[], _changed: readonly string[]): string {
  throw new Error('尚未實作：barMessage');
}
