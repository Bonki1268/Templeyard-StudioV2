import { describe, expect, it } from 'vitest';
import { TEMPLE_BOARD_NOT_YET, bottomNote, currentStep, pendingItems } from './createVideoSteps';

describe('建立影片的目前步驟', () => {
  it.each([
    [{ hasVideo: false, photoCount: 0 }, '選擇寺廟'],
    [{ hasVideo: true, photoCount: 0 }, '上傳照片'],
    [{ hasVideo: true, photoCount: 1 }, '寺廟定裝版'],
    [{ hasVideo: true, photoCount: 5 }, '寺廟定裝版'],
  ])('%o → %s', (progress, step) => {
    expect(currentStep(progress)).toBe(step);
  });
});

describe('產生寺廟定裝版之前的待處理項目', () => {
  it('還沒選寺廟時，要選寺廟也要上傳照片', () => {
    expect(pendingItems({ hasVideo: false, photoCount: 0 })).toEqual(['選擇寺廟', '上傳至少 1 張照片']);
  });

  it('選好寺廟但沒有照片時，只剩上傳照片', () => {
    expect(pendingItems({ hasVideo: true, photoCount: 0 })).toEqual(['上傳至少 1 張照片']);
  });

  it('有照片之後沒有待處理', () => {
    expect(pendingItems({ hasVideo: true, photoCount: 1 })).toEqual([]);
  });
});

describe('底部操作列的說明', () => {
  it('有待處理時列出項目', () => {
    expect(bottomNote({ hasVideo: true, photoCount: 0 })).toBe('還有 1 項待處理：上傳至少 1 張照片');
  });

  it('都準備好時，說明產生寺廟定裝版還沒開放', () => {
    expect(bottomNote({ hasVideo: true, photoCount: 2 })).toBe(TEMPLE_BOARD_NOT_YET);
  });
});
