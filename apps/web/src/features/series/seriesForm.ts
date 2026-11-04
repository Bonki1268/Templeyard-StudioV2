import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  IMAGE_MODEL_KEYS,
  SERIES_DIRECTIONS,
  VIDEO_MODEL_KEYS,
  type CreateSeriesInput,
  type ImageModelKey,
  type Series,
  type UpdateSeriesInput,
  type VideoModelKey,
} from '@templeyard/shared';

// 系列表單：建立與修改共用（使用者 2026-11-05 提出：不選秒數，秒數在每支影片的問卷「長度」選）

export type SeriesFormState = {
  name: string;
  visualStyle: string;
  /** 選取的影片方向；自己寫時為 null */
  directionOption: string | null;
  directionOther: string;
  defaultImageModel: ImageModelKey;
  defaultVideoModel: VideoModelKey;
};

/** 表單初始值：系列預設模型，其他留白 */
export function initialSeriesForm(): SeriesFormState {
  return {
    name: '',
    visualStyle: '',
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

function formFields(state: SeriesFormState) {
  return {
    name: state.name.trim(),
    visualStyle: state.visualStyle.trim(),
    direction: resolveDirection(state),
    defaultImageModel: state.defaultImageModel,
    defaultVideoModel: state.defaultVideoModel,
  };
}

export function toCreateSeriesInput(state: SeriesFormState): CreateSeriesInput {
  return formFields(state);
}

function isImageModel(key: string): key is ImageModelKey {
  return (IMAGE_MODEL_KEYS as readonly string[]).includes(key);
}

function isVideoModel(key: string): key is VideoModelKey {
  return (VIDEO_MODEL_KEYS as readonly string[]).includes(key);
}

/** 修改系列設定的表單初始值：帶入系列目前的設定；方向不是選項之一時放在「或自己寫」；模型已不在清單時改用預設模型 */
export function seriesFormFrom(series: Series): SeriesFormState {
  const isOption = (SERIES_DIRECTIONS as readonly string[]).includes(series.direction);
  return {
    name: series.name,
    visualStyle: series.visualStyle,
    directionOption: isOption ? series.direction : null,
    directionOther: isOption ? '' : series.direction,
    defaultImageModel: isImageModel(series.defaultImageModel) ? series.defaultImageModel : DEFAULT_IMAGE_MODEL,
    defaultVideoModel: isVideoModel(series.defaultVideoModel) ? series.defaultVideoModel : DEFAULT_VIDEO_MODEL,
  };
}

/** 修改系列設定送出的資料 */
export function toUpdateSeriesInput(state: SeriesFormState): UpdateSeriesInput {
  return formFields(state);
}
