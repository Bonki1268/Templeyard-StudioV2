import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_SERIES_DURATION,
  DEFAULT_VIDEO_MODEL,
  type CreateSeriesInput,
  type ImageModelKey,
  type Series,
  type UpdateSeriesInput,
  type VideoModelKey,
} from '@templeyard/shared';

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
  return {
    name: '',
    visualStyle: '',
    durationSec: DEFAULT_SERIES_DURATION,
    directionOption: null,
    directionOther: '',
    defaultImageModel: DEFAULT_IMAGE_MODEL,
    defaultVideoModel: DEFAULT_VIDEO_MODEL,
  };
}

/** 影片方向：自己寫的優先，其次是選項 */
export function resolveDirection(state: SeriesFormState): string {
  return state.directionOther.trim() || state.directionOption?.trim() || '';
}

/** 還沒填的必填欄位名稱 */
export function pendingItems(state: SeriesFormState): string[] {
  const items: string[] = [];
  if (!state.name.trim()) items.push('系列名稱');
  if (!state.visualStyle.trim()) items.push('整體視覺風格');
  if (!resolveDirection(state)) items.push('影片方向');
  return items;
}

/** 「還有 N 項待處理：…」；沒有待處理時回傳空字串 */
export function pendingMessage(items: readonly string[]): string {
  return items.length === 0 ? '' : `還有 ${items.length} 項待處理：${items.join('、')}`;
}

export function toCreateSeriesInput(state: SeriesFormState): CreateSeriesInput {
  return {
    name: state.name.trim(),
    visualStyle: state.visualStyle.trim(),
    durationSec: state.durationSec,
    direction: resolveDirection(state),
    defaultImageModel: state.defaultImageModel,
    defaultVideoModel: state.defaultVideoModel,
  };
}

/** 修改系列設定的表單初始值：帶入系列目前的設定（使用者 2026-11-05 提出） */
export function seriesFormFrom(_series: Series): SeriesFormState {
  return initialSeriesForm();
}

/** 修改系列設定送出的資料 */
export function toUpdateSeriesInput(_state: SeriesFormState): UpdateSeriesInput {
  return {};
}

/** 系列卡片的說明列，例如「20 秒 · 節慶宣傳」 */
export function seriesMeta(series: Pick<Series, 'durationSec' | 'direction'>): string {
  return `${series.durationSec} 秒 · ${series.direction}`;
}
