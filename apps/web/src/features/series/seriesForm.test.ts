import { DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL } from '@templeyard/shared';
import { describe, expect, it } from 'vitest';
import {
  initialSeriesForm,
  pendingItems,
  pendingMessage,
  resolveDirection,
  seriesMeta,
  toCreateSeriesInput,
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

describe('建立系列表單', () => {
  it('初始值：秒數 30、帶入系列預設模型、其他留白', () => {
    expect(initialSeriesForm()).toEqual({
      name: '',
      visualStyle: '',
      durationSec: 30,
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

describe('送出的資料與卡片顯示', () => {
  it('轉成建立系列的 API 資料，文字去掉前後空白', () => {
    expect(toCreateSeriesInput({ ...filledForm(), name: ' 新北廟宇故事 ', durationSec: 20 })).toEqual({
      name: '新北廟宇故事',
      visualStyle: '寫實電影感',
      durationSec: 20,
      direction: '歷史故事',
      defaultImageModel: DEFAULT_IMAGE_MODEL,
      defaultVideoModel: DEFAULT_VIDEO_MODEL,
    });
  });

  it('卡片說明列是「秒數 · 方向」', () => {
    expect(seriesMeta({ durationSec: 20, direction: '節慶宣傳' })).toBe('20 秒 · 節慶宣傳');
  });
});
