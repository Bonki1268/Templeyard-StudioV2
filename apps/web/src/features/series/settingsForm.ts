import { QUESTIONNAIRE_QUESTIONS, type QuestionnaireDefaults } from '@templeyard/shared';
import { resolveDirection, type SeriesFormState } from './seriesForm';

// 系列設定分頁的表單狀態：哪些欄位改了、底部操作列的說明、費用欄位的檢查（03 系列設定分頁）

export type CostFormState = { videoLimit: string; threshold: string };

export type SettingsFormState = {
  series: SeriesFormState;
  /** 問卷預設值的修改：題目編號 → 新答案；null 表示清除 */
  defaultsPatch: Record<string, { choice?: string; custom?: string } | null>;
  cost: CostFormState;
};

const COST_LABELS = { videoLimit: '每支影片的費用上限', threshold: '單筆同意門檻' } as const;

/** 費用欄位：空白代表沒有設定；整數點數；其他回傳說明 */
export function parseCreditsField(text: string, label: string): { ok: true; value: number | null } | { ok: false; message: string } {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, value: null };
  if (!/^[0-9]+$/.test(trimmed)) return { ok: false, message: `${label}要是 0 以上的整數點數` };
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? { ok: true, value } : { ok: false, message: `${label}要是 0 以上的整數點數` };
}

/** 問卷預設值的一題：改成的答案文字（選項或自己寫） */
function answerText(answer: { choice?: string; custom?: string } | null | undefined): string {
  return answer?.choice?.trim() || answer?.custom?.trim() || '';
}


/** 和已儲存的內容比對，列出改過的項目（依畫面順序；問卷預設值逐題列出為「問卷預設值「語氣」」） */
export function changedItems(saved: SettingsFormState, current: SettingsFormState, defaults: QuestionnaireDefaults | null): string[] {
  const a = saved.series;
  const b = current.series;
  const items: string[] = [];
  if (a.name.trim() !== b.name.trim()) items.push('系列名稱');
  if (resolveDirection(a) !== resolveDirection(b)) items.push('影片方向');
  if (a.visualStyle.trim() !== b.visualStyle.trim()) items.push('整體視覺風格');
  if (a.defaultImageModel !== b.defaultImageModel) items.push('預設圖片模型');
  if (a.defaultVideoModel !== b.defaultVideoModel) items.push('預設影片模型');
  for (const question of QUESTIONNAIRE_QUESTIONS) {
    if (!(question.id in current.defaultsPatch)) continue;
    const next = answerText(current.defaultsPatch[question.id]);
    const before = answerText(defaults?.[question.id]);
    if (next !== before) items.push(`問卷預設值「${question.title}」`);
  }
  if (saved.cost.videoLimit.trim() !== current.cost.videoLimit.trim()) items.push(COST_LABELS.videoLimit);
  if (saved.cost.threshold.trim() !== current.cost.threshold.trim()) items.push(COST_LABELS.threshold);
  return items;
}

/** 還沒填好的欄位（必填欄位空白、費用格式不正確） */
export function blockingItems(current: SettingsFormState): string[] {
  const items: string[] = [];
  if (!current.series.name.trim()) items.push('系列名稱');
  if (!resolveDirection(current.series)) items.push('影片方向');
  if (!current.series.visualStyle.trim()) items.push('整體視覺風格');
  for (const key of ['videoLimit', 'threshold'] as const) {
    const parsed = parseCreditsField(current.cost[key], COST_LABELS[key]);
    if (!parsed.ok) items.push(parsed.message);
  }
  return items;
}

/** 底部操作列左側的說明：有待處理的優先；其次是未儲存的變更；都沒有時說沒有 */
export function barMessage(blocking: readonly string[], changed: readonly string[]): string {
  if (blocking.length > 0) return `還有 ${blocking.length} 項待處理：${blocking.join('、')}`;
  if (changed.length > 0) return `有 ${changed.length} 項未儲存的變更：${changed.join('、')}`;
  return '沒有未儲存的變更';
}
