import { describe, expect, it } from 'vitest';
import { QUICK_TAGS, applyQuickTag, chatRequestSchema, quickTagOpening } from './chat.js';

describe('快捷標籤', () => {
  it.each([
    ['歷史故事', '我想講板橋慈惠宮的歷史故事：'],
    ['神明傳說', '我想講板橋慈惠宮主祀神明的傳說：'],
    ['節慶活動', '我想介紹板橋慈惠宮的節慶活動：'],
    ['景點導覽', '我想帶大家逛板橋慈惠宮：'],
    ['人物代言', '我想請一位代言人介紹板橋慈惠宮：'],
  ] as const)('「%s」帶入「%s」', (tag, opening) => {
    expect(quickTagOpening(tag, '板橋慈惠宮')).toBe(opening);
  });

  it('五個標籤依規格書的順序', () => {
    expect(QUICK_TAGS).toEqual(['歷史故事', '神明傳說', '節慶活動', '景點導覽', '人物代言']);
  });

  it('輸入框是空的：帶入句子開頭', () => {
    expect(applyQuickTag('', '歷史故事', '板橋慈惠宮')).toBe('我想講板橋慈惠宮的歷史故事：');
  });

  it('已經是另一個標籤的開頭：換掉開頭，保留後面自己寫的內容', () => {
    expect(applyQuickTag('我想講板橋慈惠宮的歷史故事：清代建廟的經過', '節慶活動', '板橋慈惠宮')).toBe(
      '我想介紹板橋慈惠宮的節慶活動：清代建廟的經過',
    );
  });

  it('已經自己寫了內容：句子開頭加在最前面', () => {
    expect(applyQuickTag('媽祖救漁民', '神明傳說', '板橋慈惠宮')).toBe('我想講板橋慈惠宮主祀神明的傳說：媽祖救漁民');
  });

  it('再按一次同一個標籤不會重複帶入', () => {
    expect(applyQuickTag('我想帶大家逛板橋慈惠宮：', '景點導覽', '板橋慈惠宮')).toBe('我想帶大家逛板橋慈惠宮：');
  });
});

describe('對話請求', () => {
  it('去掉前後空白；空白或超過 2000 字時說明原因', () => {
    expect(chatRequestSchema.parse({ content: '  講媽祖的故事 ' })).toEqual({ content: '講媽祖的故事' });
    expect(chatRequestSchema.safeParse({ content: '   ' }).error?.issues[0]?.message).toBe('請輸入想對 Agent 說的話');
    expect(chatRequestSchema.safeParse({ content: '字'.repeat(2001) }).error?.issues[0]?.message).toBe('內容最多 2000 字');
  });
});
