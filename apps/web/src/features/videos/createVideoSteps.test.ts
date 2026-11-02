import { describe, expect, it } from 'vitest';
import { boardEstimateText, bottomNote, currentStep, pendingItems } from './createVideoSteps';

const ready = { hasVideo: true, photoCount: 1, plannedViewCount: 1 };

describe('建立影片的目前步驟', () => {
  it.each([
    [{ hasVideo: false, photoCount: 0, plannedViewCount: 0 }, '選擇寺廟'],
    [{ hasVideo: true, photoCount: 0, plannedViewCount: 0 }, '上傳照片'],
    [{ hasVideo: true, photoCount: 1, plannedViewCount: 0 }, '寺廟定裝版'],
    [{ hasVideo: true, photoCount: 5, plannedViewCount: 3 }, '寺廟定裝版'],
  ])('%o → %s', (progress, step) => {
    expect(currentStep(progress)).toBe(step);
  });
});

describe('產生寺廟定裝版之前的待處理項目', () => {
  it('還沒選寺廟時，要選寺廟也要上傳照片', () => {
    expect(pendingItems({ hasVideo: false, photoCount: 0, plannedViewCount: 0 })).toEqual(['選擇寺廟', '上傳至少 1 張照片']);
  });

  it('選好寺廟但沒有照片時，只剩上傳照片', () => {
    expect(pendingItems({ hasVideo: true, photoCount: 0, plannedViewCount: 0 })).toEqual(['上傳至少 1 張照片']);
  });

  it('有照片但沒有任何要產生的視角時，要指定視角或讓 AI 推測', () => {
    expect(pendingItems({ hasVideo: true, photoCount: 2, plannedViewCount: 0 })).toEqual([
      '在照片指定拍到的視角，或讓 AI 推測缺少的視角',
    ]);
  });

  it('有要產生的視角之後沒有待處理', () => {
    expect(pendingItems(ready)).toEqual([]);
  });
});

describe('產生寺廟定裝版的費用預估', () => {
  it('參考單價待實測時說明待實測', () => {
    expect(boardEstimateText(2, 'Nano Banana Pro', { credits: null, lines: [] })).toBe('預估：2 張視角圖，Nano Banana Pro 參考單價待實測');
  });

  it('有參考單價時顯示點數', () => {
    expect(boardEstimateText(5, 'Nano Banana Pro', { credits: 1200, lines: [] })).toBe('預估：5 張視角圖，約 1,200 點');
  });

  it('還在預估時顯示預估中', () => {
    expect(boardEstimateText(1, 'Nano Banana Pro', null)).toBe('預估：1 張視角圖，費用預估中…');
  });
});

describe('底部操作列的說明', () => {
  it('有待處理時列出項目', () => {
    expect(bottomNote({ hasVideo: true, photoCount: 0, plannedViewCount: 0 }, '預估：…')).toBe('還有 1 項待處理：上傳至少 1 張照片');
  });

  it('都準備好時顯示費用預估（花錢的按鈕旁邊一定有預估）', () => {
    expect(bottomNote(ready, '預估：1 張視角圖，Nano Banana Pro 參考單價待實測')).toBe('預估：1 張視角圖，Nano Banana Pro 參考單價待實測');
  });
});
