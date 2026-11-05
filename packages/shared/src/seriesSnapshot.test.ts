import { describe, expect, it } from 'vitest';
import { makeSeriesSnapshot, seriesSettingsOf } from './seriesSnapshot.js';

const live = {
  visualStyle: '水墨淡彩',
  direction: '景點導覽',
  defaultImageModel: 'nano-banana-pro',
  defaultVideoModel: 'seedance-2.0',
  questionnaireDefaults: { tone: { choice: '輕鬆' } },
};

describe('影片保存的系列設定', () => {
  it('快照帶上視覺風格、方向、預設模型與問卷預設值', () => {
    expect(makeSeriesSnapshot(live)).toEqual(live);
  });

  it('快照是複本：之後改系列的問卷預設值，快照不跟著變', () => {
    const snapshot = makeSeriesSnapshot(live);
    live.questionnaireDefaults.tone = { choice: '莊重' };
    expect(snapshot.questionnaireDefaults).toEqual({ tone: { choice: '輕鬆' } });
    live.questionnaireDefaults.tone = { choice: '輕鬆' };
  });

  it('問卷預設值格式不正確時，快照當成沒有預設值', () => {
    expect(makeSeriesSnapshot({ ...live, questionnaireDefaults: { tone: 'bad' } }).questionnaireDefaults).toBeNull();
  });

  it('有格式正確的快照就用快照，不看系列目前的設定', () => {
    const old = { ...live, visualStyle: '寫實電影感', defaultVideoModel: 'gemini-omni-1.1-flash', questionnaireDefaults: null };
    expect(seriesSettingsOf(old, live)).toEqual(old);
  });

  it.each([[null], [undefined], ['壞掉的字串'], [{ visualStyle: 1 }]])('快照是 %j（舊資料或壞掉）時，改用系列目前的設定', (snapshot) => {
    expect(seriesSettingsOf(snapshot, live)).toEqual(live);
  });
});
