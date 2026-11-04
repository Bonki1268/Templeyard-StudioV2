import { DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL, type Series } from '@templeyard/shared';
import { describe, expect, it } from 'vitest';
import {
  initialSeriesForm,
  pendingItems,
  pendingMessage,
  resolveDirection,
  seriesFormFrom,
  toCreateSeriesInput,
  toUpdateSeriesInput,
  type SeriesFormState,
} from './seriesForm';

// 必填都填好的表單；用函式產生，尚未實作時每個測試各自失敗
function filledForm(): SeriesFormState {
  return {
    ...initialSeriesForm(),
    name: '新北廟宇故事',
    visualStyle: '寫實電影感',
    directionOption: '歷史故事',
  };
}

function savedSeries(overrides: Partial<Series> = {}): Series {
  return {
    id: 's1',
    name: '新北廟宇故事',
    visualStyle: '寫實電影感',
    direction: '歷史故事',
    defaultImageModel: 'nano-banana-pro',
    defaultVideoModel: 'seedance-2.0',
    questionnaireDefaults: null,
    createdAt: '2026-11-05T00:00:00.000Z',
    updatedAt: '2026-11-05T00:00:00.000Z',
    ...overrides,
  };
}

describe('建立系列表單', () => {
  // 使用者 2026-11-05 提出：建立系列不選秒數
  it('初始值：帶入系列預設模型、其他留白，沒有秒數', () => {
    expect(initialSeriesForm()).toEqual({
      name: '',
      visualStyle: '',
      directionOption: null,
      directionOther: '',
      defaultImageModel: DEFAULT_IMAGE_MODEL,
      defaultVideoModel: DEFAULT_VIDEO_MODEL,
    });
  });

  it('空白表單有 3 項待處理：系列名稱、整體視覺風格、影片方向', () => {
    expect(pendingItems(initialSeriesForm())).toEqual(['系列名稱', '整體視覺風格', '影片方向']);
  });

  it('只有空白字元也算沒填', () => {
    expect(pendingItems({ ...filledForm(), name: '   ' })).toEqual(['系列名稱']);
  });

  it('全部填好時沒有待處理', () => {
    expect(pendingItems(filledForm())).toEqual([]);
  });

  it('待處理說明：「還有 N 項待處理：…」', () => {
    expect(pendingMessage(['系列名稱', '影片方向'])).toBe('還有 2 項待處理：系列名稱、影片方向');
  });

  it('沒有待處理時說明是空字串', () => {
    expect(pendingMessage([])).toBe('');
  });
});

describe('影片方向', () => {
  it('選了選項就用選項', () => {
    expect(resolveDirection(filledForm())).toBe('歷史故事');
  });

  it('自己寫的優先於選項，並去掉前後空白', () => {
    expect(resolveDirection({ ...filledForm(), directionOther: '  廟口美食 ' })).toBe('廟口美食');
  });

  it('只填自己寫也算填了影片方向', () => {
    expect(pendingItems({ ...filledForm(), directionOption: null, directionOther: '廟口美食' })).toEqual([]);
  });
});

describe('送出的資料', () => {
  it('轉成建立系列的 API 資料，文字去掉前後空白，沒有秒數', () => {
    expect(toCreateSeriesInput({ ...filledForm(), name: ' 新北廟宇故事 ' })).toEqual({
      name: '新北廟宇故事',
      visualStyle: '寫實電影感',
      direction: '歷史故事',
      defaultImageModel: DEFAULT_IMAGE_MODEL,
      defaultVideoModel: DEFAULT_VIDEO_MODEL,
    });
  });
});

// 使用者 2026-11-05 提出：系列設定可以修改
describe('修改系列設定的表單', () => {
  it('從系列帶入目前的設定；方向是選項之一時選取該選項', () => {
    expect(seriesFormFrom(savedSeries())).toEqual({
      name: '新北廟宇故事',
      visualStyle: '寫實電影感',
      directionOption: '歷史故事',
      directionOther: '',
      defaultImageModel: 'nano-banana-pro',
      defaultVideoModel: 'seedance-2.0',
    });
  });

  it('方向是自己寫的：放在「或自己寫」，不選取任何選項', () => {
    const form = seriesFormFrom(savedSeries({ direction: '廟口美食' }));
    expect(form.directionOption).toBeNull();
    expect(form.directionOther).toBe('廟口美食');
  });

  it('系列的預設模型已經不在清單：改用目前的預設模型', () => {
    const form = seriesFormFrom(savedSeries({ defaultImageModel: 'retired-model', defaultVideoModel: 'retired-video' }));
    expect(form.defaultImageModel).toBe(DEFAULT_IMAGE_MODEL);
    expect(form.defaultVideoModel).toBe(DEFAULT_VIDEO_MODEL);
  });

  it('帶入後沒有待處理', () => {
    expect(pendingItems(seriesFormFrom(savedSeries()))).toEqual([]);
  });

  it('轉成修改系列的 API 資料，文字去掉前後空白', () => {
    const form = { ...seriesFormFrom(savedSeries()), visualStyle: ' 水墨淡彩 ', directionOption: null, directionOther: '景點導覽 ' };
    expect(toUpdateSeriesInput(form)).toEqual({
      name: '新北廟宇故事',
      visualStyle: '水墨淡彩',
      direction: '景點導覽',
      defaultImageModel: 'nano-banana-pro',
      defaultVideoModel: 'seedance-2.0',
    });
  });
});
