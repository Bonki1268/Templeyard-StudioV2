import { describe, expect, it } from 'vitest';
import { normalizeTempleName, parseNameFlags, statusFromFlags } from './name.js';

describe('搜尋用名稱', () => {
  it.each([
    ['臺北鎮北宮', '台北鎮北宮', '「臺」轉「台」'],
    ['財團法人新北市泰山巖', '泰山巖', '去掉「財團法人新北市」'],
    ['財團法人臺灣省臺北縣白雲寺', '白雲寺', '去掉「財團法人台灣省台北縣」'],
    ['財團法人台灣省台北縣新店市廣照禪寺', '新店市廣照禪寺', '只去掉前綴，市名保留'],
    ['財團法人下文山清水祖師', '下文山清水祖師', '只有「財團法人」'],
    ['萬壽宮(已廢止)', '萬壽宮', '去掉已廢止註記'],
    ['台灣全真仙觀(尚未取得正式寺廟登記證)', '台灣全真仙觀', '去掉未登記註記'],
    ['慈惠宮（媽祖宮）', '慈惠宮(媽祖宮)', '全形括號轉半形，其他括號內容保留'],
    [' 福德宮 ', '福德宮', '去掉前後空白'],
  ])('「%s」→「%s」（%s）', (name, expected) => {
    expect(normalizeTempleName(name)).toBe(expected);
  });
});

describe('名稱標記與狀態', () => {
  it('財團法人開頭的寺廟標記為財團法人，狀態仍為有效', () => {
    const flags = parseNameFlags('財團法人新北市泰山巖');
    expect(flags).toEqual(['foundation']);
    expect(statusFromFlags(flags)).toBe('active');
  });

  it('名稱有「(已廢止)」時標記為已廢止', () => {
    const flags = parseNameFlags('萬壽宮(已廢止)');
    expect(flags).toEqual(['abolished']);
    expect(statusFromFlags(flags)).toBe('abolished');
  });

  it('名稱有「(尚未取得正式寺廟登記證)」時標記為未登記', () => {
    const flags = parseNameFlags('台灣全真仙觀(尚未取得正式寺廟登記證)');
    expect(flags).toEqual(['unregistered']);
    expect(statusFromFlags(flags)).toBe('unregistered');
  });

  it('財團法人且已廢止時，兩個標記都有，狀態為已廢止', () => {
    const flags = parseNameFlags('財團法人新北市某某宮(已廢止)');
    expect(flags).toEqual(['foundation', 'abolished']);
    expect(statusFromFlags(flags)).toBe('abolished');
  });

  it('一般名稱沒有標記，狀態為有效', () => {
    expect(parseNameFlags('福龍宮')).toEqual([]);
    expect(statusFromFlags([])).toBe('active');
  });
});
