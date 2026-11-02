import type { CreateSeriesInput, ImageModelKey, Series, VideoModelKey } from '@templeyard/shared';

export type SeriesFormState = {
  name: string;
  visualStyle: string;
  durationSec: number;
  /** 選取的影片方向；自己寫時為 null */
  directionOption: string | null;
  directionOther: string;
  defaultImageModel: ImageModelKey;
  defaultVideoModel: VideoModelKey;
};

/** 表單初始值：秒數 30、系列預設模型 */
export function initialSeriesForm(): SeriesFormState {
  throw new Error('尚未實作');
}

/** 影片方向：自己寫的優先，其次是選項 */
export function resolveDirection(_state: SeriesFormState): string {
  throw new Error('尚未實作');
}

/** 還沒填的必填欄位名稱 */
export function pendingItems(_state: SeriesFormState): string[] {
  throw new Error('尚未實作');
}

/** 「還有 N 項待處理：…」；沒有待處理時回傳空字串 */
export function pendingMessage(_items: readonly string[]): string {
  throw new Error('尚未實作');
}

export function toCreateSeriesInput(_state: SeriesFormState): CreateSeriesInput {
  throw new Error('尚未實作');
}

/** 系列卡片的說明列，例如「20 秒 · 節慶宣傳」 */
export function seriesMeta(_series: Pick<Series, 'durationSec' | 'direction'>): string {
  throw new Error('尚未實作');
}
