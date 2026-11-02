import { describe, expect, it } from 'vitest';
import { photoCountText, planUploads, skippedMessage } from './uploadPlan';

describe('照片張數上限（每間廟 5 張）', () => {
  it('還有空間時全部上傳', () => {
    expect(planUploads(1, ['a', 'b'])).toEqual({ accepted: ['a', 'b'], skipped: 0 });
  });

  it('超過的部分不上傳，只取前面幾張', () => {
    expect(planUploads(3, ['a', 'b', 'c', 'd'])).toEqual({ accepted: ['a', 'b'], skipped: 2 });
  });

  it('已經 5 張時一張都不上傳', () => {
    expect(planUploads(5, ['a'])).toEqual({ accepted: [], skipped: 1 });
  });

  it('一次選 6 張時上傳 5 張、略過 1 張', () => {
    expect(planUploads(0, [1, 2, 3, 4, 5, 6])).toEqual({ accepted: [1, 2, 3, 4, 5], skipped: 1 });
  });
});

describe('張數的文字', () => {
  it('顯示目前張數與上限', () => {
    expect(photoCountText(4)).toBe('4 / 5 張・照片會先在你的電腦上去識別');
  });

  it('說明有幾張沒有上傳', () => {
    expect(skippedMessage(2)).toBe('每間廟最多 5 張照片，有 2 張沒有上傳');
  });
});
