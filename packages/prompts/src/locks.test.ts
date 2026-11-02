import { describe, expect, it } from 'vitest';
import { findMissingLocks, isLockVariable, splitLocks } from './locks.js';

describe('哪些變數是連續性鎖', () => {
  it.each([
    ['temple.appearanceLocks', true],
    ['character.locks', true],
    ['shot.lighting', false],
    ['locksmith', false],
  ])('%s → %s', (name, expected) => {
    expect(isLockVariable(name)).toBe(expected);
  });
});

describe('拆成一條一條的鎖', () => {
  it('字串以分號或換行分隔，去掉空白與空項', () => {
    expect(splitLocks(' red roof ridge ;\n grey granite columns ;; ')).toEqual(['red roof ridge', 'grey granite columns']);
  });

  it('陣列逐項', () => {
    expect(splitLocks(['indigo cotton jacket', ' ', 'round silver glasses'])).toEqual(['indigo cotton jacket', 'round silver glasses']);
  });

  it('沒有值時沒有鎖', () => {
    expect(splitLocks(undefined)).toEqual([]);
    expect(splitLocks('')).toEqual([]);
  });
});

describe('最終指令有沒有逐字帶入連續性鎖', () => {
  const locks = ['red swallowtail roof ridge', 'grey granite dragon columns'];

  it('都有出現時沒有缺少（不分大小寫）', () => {
    const prompt = 'Wide shot. The RED swallowtail roof ridge glows; grey granite dragon columns frame the gate.';
    expect(findMissingLocks(prompt, locks)).toEqual([]);
  });

  it('列出沒有出現的鎖', () => {
    expect(findMissingLocks('The red swallowtail roof ridge at dusk.', locks)).toEqual(['grey granite dragon columns']);
  });

  it('改寫過的不算（要逐字）', () => {
    expect(findMissingLocks('red swallow-tail roof ridge, granite columns', locks)).toEqual(locks);
  });

  it('只出現在 no／without／不要 之後的不算', () => {
    expect(findMissingLocks('No red swallowtail roof ridge. Without grey granite dragon columns.', locks)).toEqual(locks);
    expect(findMissingLocks('畫面不要出現 red swallowtail roof ridge', ['red swallowtail roof ridge'])).toEqual([
      'red swallowtail roof ridge',
    ]);
  });

  it('否定詞在前一句時不影響這一句', () => {
    expect(findMissingLocks('No people. The red swallowtail roof ridge is lit.', ['red swallowtail roof ridge'])).toEqual([]);
  });

  it('同一條鎖有一處正常出現就算有', () => {
    expect(
      findMissingLocks('Do not crop the grey granite dragon columns. Grey granite dragon columns stand left.', [
        'grey granite dragon columns',
      ]),
    ).toEqual([]);
  });
});
