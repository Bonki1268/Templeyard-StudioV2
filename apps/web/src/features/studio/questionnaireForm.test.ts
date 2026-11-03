import { describe, expect, it } from 'vitest';
import { chooseOption, draftFrom, draftSource, toAnswerInput, togglePhoto, typeCustom } from './questionnaireForm';

const empty = { choice: null, custom: '', photoIds: [] };

describe('作答狀態', () => {
  it('從問卷的答案建立', () => {
    expect(draftFrom({ questionId: 'tone', choice: '溫暖', source: 'series_default' })).toEqual({ ...empty, choice: '溫暖' });
    expect(draftFrom({ questionId: 'story', custom: '故事', source: 'user' })).toEqual({ ...empty, custom: '故事' });
    expect(draftFrom({ questionId: 'photos', photoIds: ['p1'], source: 'user' })).toEqual({ ...empty, photoIds: ['p1'] });
    expect(draftFrom({ questionId: 'tone', source: 'system' })).toEqual(empty);
  });

  it('點選項：選取並清掉自己寫', () => {
    expect(chooseOption({ ...empty, custom: '自己寫的' }, '溫暖')).toEqual({ ...empty, choice: '溫暖' });
  });

  it('再按一次已選取的選項：取消，變成留白', () => {
    expect(chooseOption({ ...empty, choice: '溫暖' }, '溫暖')).toEqual(empty);
  });

  it('自己寫有內容時取消選項；清空自己寫不會把選項找回來', () => {
    const typed = typeCustom({ ...empty, choice: '溫暖' }, '讓年輕人認識媽祖');
    expect(typed).toEqual({ ...empty, custom: '讓年輕人認識媽祖' });
    expect(typeCustom(typed, '')).toEqual(empty);
  });

  it('只打空白不會取消選項', () => {
    expect(typeCustom({ ...empty, choice: '溫暖' }, '  ')).toEqual({ ...empty, choice: '溫暖', custom: '  ' });
  });

  it('勾選或取消一張照片', () => {
    const checked = togglePhoto(empty, 'p1');
    expect(checked.photoIds).toEqual(['p1']);
    expect(togglePhoto(checked, 'p1').photoIds).toEqual([]);
  });
});

describe('來源標籤', () => {
  it('和原本的答案相同：用原本的來源', () => {
    expect(draftSource({ questionId: 'tone', choice: '溫暖', source: 'series_default' }, { ...empty, choice: '溫暖' })).toBe('series_default');
  });

  it('改過：你的輸入', () => {
    expect(draftSource({ questionId: 'tone', choice: '溫暖', source: 'series_default' }, { ...empty, choice: '莊重' })).toBe('user');
    expect(draftSource({ questionId: 'goal', source: 'system' }, { ...empty, custom: '讓年輕人認識媽祖' })).toBe('user');
  });

  it('留白：系統將會選擇', () => {
    expect(draftSource({ questionId: 'length', choice: '30 秒', source: 'series_default' }, empty)).toBe('system');
    expect(draftSource({ questionId: 'story', custom: '故事', source: 'user' }, { ...empty, custom: '   ' })).toBe('system');
  });
});

describe('送出用的資料', () => {
  it('選項、自己寫、照片各自送出；空白不送', () => {
    expect(toAnswerInput('tone', { ...empty, choice: '溫暖' })).toEqual({ questionId: 'tone', choice: '溫暖' });
    expect(toAnswerInput('goal', { ...empty, custom: ' 讓年輕人認識媽祖 ' })).toEqual({ questionId: 'goal', custom: '讓年輕人認識媽祖' });
    expect(toAnswerInput('photos', { ...empty, photoIds: ['p1'] })).toEqual({ questionId: 'photos', photoIds: ['p1'] });
    expect(toAnswerInput('tone', { ...empty, custom: '  ' })).toEqual({ questionId: 'tone' });
  });
});
