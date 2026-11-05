import { describe, expect, it } from 'vitest';
import { initialSeriesForm } from './seriesForm';
import { barMessage, blockingItems, changedItems, parseCreditsField, type SettingsFormState } from './settingsForm';

function form(overrides: Partial<SettingsFormState['series']> = {}, rest: Partial<Omit<SettingsFormState, 'series'>> = {}): SettingsFormState {
  return {
    series: { ...initialSeriesForm(), name: '淡水廟宇故事', visualStyle: '溫暖寫實', directionOption: '歷史故事', ...overrides },
    defaultsPatch: {},
    cost: { videoLimit: '', threshold: '' },
    ...rest,
  };
}

describe('費用欄位', () => {
  it('空白代表沒有設定', () => {
    expect(parseCreditsField('', '單筆同意門檻')).toEqual({ ok: true, value: null });
    expect(parseCreditsField('   ', '單筆同意門檻')).toEqual({ ok: true, value: null });
  });

  it('整數點數（可以是 0）', () => {
    expect(parseCreditsField('5000', '單筆同意門檻')).toEqual({ ok: true, value: 5000 });
    expect(parseCreditsField(' 0 ', '單筆同意門檻')).toEqual({ ok: true, value: 0 });
  });

  it.each(['abc', '1.5', '-3', '1e3', '１２'])('「%s」不是整數點數，說明是哪個欄位', (text) => {
    expect(parseCreditsField(text, '單筆同意門檻')).toEqual({ ok: false, message: '單筆同意門檻要是 0 以上的整數點數' });
  });
});

describe('未儲存的變更', () => {
  it('完全相同時沒有變更', () => {
    expect(changedItems(form(), form(), null)).toEqual([]);
  });

  it('依畫面順序列出改過的欄位', () => {
    const current = form({ name: '新名字', visualStyle: '水墨', directionOption: '景點導覽', defaultVideoModel: 'seedance-2.0' }, { cost: { videoLimit: '5000', threshold: '400' } });
    expect(changedItems(form(), current, null)).toEqual(['系列名稱', '影片方向', '整體視覺風格', '預設影片模型', '每支影片的費用上限', '單筆同意門檻']);
  });

  it('自己寫的方向和選項的方向，只要結果相同就不算改過', () => {
    const saved = form({ directionOption: null, directionOther: '跟著廟公走一天' });
    const current = form({ directionOption: null, directionOther: '  跟著廟公走一天 ' });
    expect(changedItems(saved, current, null)).toEqual([]);
  });

  it('前後空白不算改過', () => {
    expect(changedItems(form(), form({ name: ' 淡水廟宇故事 ' }), null)).toEqual([]);
  });

  it('問卷預設值逐題列出；改回原本的答案就不算', () => {
    const saved = form();
    const current = form({}, { defaultsPatch: { tone: { choice: '輕鬆' }, length: null, goal: { choice: '介紹歷史' } } });
    const defaults = { tone: { choice: '溫暖' }, length: { choice: '30 秒' }, goal: { choice: '介紹歷史' } };
    expect(changedItems(saved, current, defaults)).toEqual(['問卷預設值「語氣」', '問卷預設值「長度」']);
  });
});

describe('還沒填好的欄位', () => {
  it('必填欄位空白', () => {
    expect(blockingItems(form({ name: ' ', visualStyle: '', directionOption: null }))).toEqual(['系列名稱', '影片方向', '整體視覺風格']);
  });

  it('費用格式不正確時，說明寫在項目裡', () => {
    expect(blockingItems(form({}, { cost: { videoLimit: '', threshold: 'abc' } }))).toEqual(['單筆同意門檻要是 0 以上的整數點數']);
    expect(blockingItems(form({}, { cost: { videoLimit: '1.5', threshold: '' } }))).toEqual(['每支影片的費用上限要是 0 以上的整數點數']);
  });

  it('都填好時是空的', () => {
    expect(blockingItems(form())).toEqual([]);
  });
});

describe('底部操作列的說明', () => {
  it('有待處理的欄位時優先說明', () => {
    expect(barMessage(['系列名稱'], ['影片方向'])).toBe('還有 1 項待處理：系列名稱');
    expect(barMessage(['系列名稱', '影片方向'], [])).toBe('還有 2 項待處理：系列名稱、影片方向');
  });

  it('沒有待處理但有變更：列出未儲存的變更', () => {
    expect(barMessage([], ['影片方向', '整體視覺風格'])).toBe('有 2 項未儲存的變更：影片方向、整體視覺風格');
  });

  it('都沒有時說沒有未儲存的變更', () => {
    expect(barMessage([], [])).toBe('沒有未儲存的變更');
  });
});
