import { describe, expect, it } from 'vitest';
import { applyDefaultsPatch, defaultRows, needsLipSyncNote, validateDefaultsPatch } from './questionnaireDefaults.js';

describe('列出問卷預設值', () => {
  it('依題庫順序列出，標題用題庫的題目', () => {
    const rows = defaultRows({ length: { choice: '30 秒' }, tone: { choice: '溫暖' }, audience: { choice: '外地遊客' } }, []);
    expect(rows.map((r) => [r.title, r.value])).toEqual([
      ['主要觀眾是誰？', '外地遊客'],
      ['語氣', '溫暖'],
      ['長度', '30 秒'],
    ]);
  });

  it('每支影片不同的題目不列入', () => {
    const rows = defaultRows({ story: { custom: '一個故事' }, mustSay: { custom: '地址' }, tone: { choice: '溫暖' } }, []);
    expect(rows.map((r) => r.questionId)).toEqual(['tone']);
  });

  it('自己寫的答案顯示文字；選項優先於自己寫；沒有答案的略過', () => {
    const rows = defaultRows({ goal: { custom: '讓年輕人認識媽祖' }, tone: { choice: '溫暖', custom: '多餘' }, length: {} }, []);
    expect(rows.map((r) => r.value)).toEqual(['讓年輕人認識媽祖', '溫暖']);
  });

  it('標示哪些題目是在系列設定改過的（自己寫）', () => {
    const rows = defaultRows({ tone: { choice: '輕鬆' }, length: { choice: '30 秒' } }, ['tone']);
    expect(rows.map((r) => [r.questionId, r.edited])).toEqual([
      ['tone', true],
      ['length', false],
    ]);
  });

  it('沒有預設值時是空的', () => {
    expect(defaultRows(null, [])).toEqual([]);
  });
});

describe('檢查修改問卷預設值', () => {
  it('選項在這一題的選項裡、或自己寫、或清除，都可以', () => {
    expect(validateDefaultsPatch({ tone: { choice: '輕鬆' } })).toEqual({ ok: true });
    expect(validateDefaultsPatch({ goal: { custom: '讓年輕人認識媽祖' } })).toEqual({ ok: true });
    expect(validateDefaultsPatch({ length: null })).toEqual({ ok: true });
  });

  it.each([
    [{ no_such: { choice: '溫暖' } }, '找不到這一題'],
    [{ tone: { choice: '搞笑' } }, '這一題沒有這個選項'],
    [{ story: { custom: '故事' } }, '這一題每支影片各自填寫，不能設為系列預設'],
    [{ photos: null }, '這一題每支影片各自填寫，不能設為系列預設'],
    [{ tone: { choice: '溫暖', custom: '更溫暖' } }, '選項和自己寫只能擇一'],
    [{ tone: {} }, '請選擇或填寫答案'],
    [{ goal: { custom: '   ' } }, '請選擇或填寫答案'],
  ] as const)('%j：%s', (patch, message) => {
    expect(validateDefaultsPatch(patch)).toEqual({ ok: false, message });
  });

  it('套用修改：覆蓋、清除、保留其他題，不改動傳入的物件', () => {
    const current = { tone: { choice: '溫暖' }, length: { choice: '30 秒' } };
    const next = applyDefaultsPatch(current, { tone: { choice: '輕鬆' }, length: null, goal: { custom: '介紹歷史' } });
    expect(next).toEqual({ tone: { choice: '輕鬆' }, goal: { custom: '介紹歷史' } });
    expect(current).toEqual({ tone: { choice: '溫暖' }, length: { choice: '30 秒' } });
  });

  it('原本沒有預設值時也能套用', () => {
    expect(applyDefaultsPatch(null, { tone: { choice: '溫暖' } })).toEqual({ tone: { choice: '溫暖' } });
  });
});

describe('對口型提醒', () => {
  it('敘事方式是「角色對鏡說話」且影片模型沒有原生語音：提醒', () => {
    expect(needsLipSyncNote({ narration: { choice: '角色對鏡說話' } }, 'wan-2.2')).toBe(true);
  });

  it('影片模型有原生語音：不提醒', () => {
    expect(needsLipSyncNote({ narration: { choice: '角色對鏡說話' } }, 'gemini-omni-1.1-flash')).toBe(false);
    expect(needsLipSyncNote({ narration: { choice: '角色對鏡說話' } }, 'seedance-2.0')).toBe(false);
  });

  it('敘事方式不需要角色說話，或沒有預設值：不提醒', () => {
    expect(needsLipSyncNote({ narration: { choice: '只有字幕' } }, 'wan-2.2')).toBe(false);
    expect(needsLipSyncNote({ narration: { choice: '旁白敘述' } }, 'wan-2.2')).toBe(false);
    expect(needsLipSyncNote(null, 'wan-2.2')).toBe(false);
  });

  it('不認得的影片模型：不提醒', () => {
    expect(needsLipSyncNote({ narration: { choice: '角色對鏡說話' } }, 'no-such-model')).toBe(false);
  });
});
