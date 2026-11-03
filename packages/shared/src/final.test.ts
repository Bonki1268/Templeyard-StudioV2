import { describe, expect, it } from 'vitest';
import { downloadFileName, scheduleRegenerationInputSchema, thumbnailStrip } from './final.js';

describe('成品的各格縮圖', () => {
  it('每格的開始秒數與佔全片的比例', () => {
    expect(
      thumbnailStrip([
        { seq: 1, shotKey: 'a', durationSec: 6 },
        { seq: 2, shotKey: 'b', durationSec: 8 },
        { seq: 3, shotKey: 'c', durationSec: 2 },
        { seq: 4, shotKey: 'd', durationSec: 10 },
      ]),
    ).toEqual([
      { seq: 1, shotKey: 'a', startSec: 0, durationSec: 6, ratio: 6 / 26 },
      { seq: 2, shotKey: 'b', startSec: 6, durationSec: 8, ratio: 8 / 26 },
      { seq: 3, shotKey: 'c', startSec: 14, durationSec: 2, ratio: 2 / 26 },
      { seq: 4, shotKey: 'd', startSec: 16, durationSec: 10, ratio: 10 / 26 },
    ]);
  });

  it('沒有格子時是空的', () => {
    expect(thumbnailStrip([])).toEqual([]);
  });
});

describe('下載的檔名', () => {
  it('寺廟名稱加上成品的日期', () => {
    expect(downloadFileName('板橋慈惠宮', '2026-11-03T09:00:00.000Z')).toBe('板橋慈惠宮-2026-11-03.mp4');
  });

  it('檔名不能用的字元換成「-」', () => {
    expect(downloadFileName('a/b:c*d?"e<f>g|h\\i', '2026-01-02T00:00:00.000Z')).toBe('a-b-c-d-e-f-g-h-i-2026-01-02.mp4');
  });
});

describe('安排重生的輸入', () => {
  it('至少一格、要有調整指令', () => {
    expect(scheduleRegenerationInputSchema.safeParse({ shots: [], instruction: '慢一點' }).success).toBe(false);
    expect(scheduleRegenerationInputSchema.safeParse({ shots: [2], instruction: '  ' }).success).toBe(false);
    expect(scheduleRegenerationInputSchema.parse({ shots: [2], instruction: ' 動作放慢一點 ' })).toEqual({ shots: [2], instruction: '動作放慢一點' });
  });
});
