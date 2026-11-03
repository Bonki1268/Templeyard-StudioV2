import { describe, expect, it } from 'vitest';
import { STUDIO_PANELS, reachablePanels, resolvePanel } from './panels';

describe('面板', () => {
  it('依 03 的順序：創作首頁、設定問卷、分鏡方案、精緻圖、成品', () => {
    expect(STUDIO_PANELS.map((p) => p.label)).toEqual(['創作首頁', '設定問卷', '分鏡方案', '精緻圖', '成品']);
  });

  it('還沒開啟問卷：只有創作首頁', () => {
    expect(reachablePanels({ hasQuestionnaire: false })).toEqual(['home']);
  });

  it('Agent 開啟問卷後：創作首頁與設定問卷', () => {
    expect(reachablePanels({ hasQuestionnaire: true })).toEqual(['home', 'questionnaire']);
  });

  it('影片生成中或有成品後：可以看成品面板（第 11 階段）', () => {
    expect(reachablePanels({ hasQuestionnaire: true, hasPlan: true, hasFrames: true, hasFinal: true })).toEqual(['home', 'questionnaire', 'plan', 'frames', 'final']);
    expect(reachablePanels({ hasQuestionnaire: true, hasPlan: true, hasFrames: true, hasFinal: false })).not.toContain('final');
  });
});

describe('要顯示哪個面板', () => {
  it('網址沒有指定：顯示最後到達的面板', () => {
    expect(resolvePanel(null, { hasQuestionnaire: false })).toBe('home');
    expect(resolvePanel(null, { hasQuestionnaire: true })).toBe('questionnaire');
  });

  it('網址指定到達過的面板：照網址', () => {
    expect(resolvePanel('home', { hasQuestionnaire: true })).toBe('home');
  });

  it('網址指定還沒到達或不存在的面板：顯示最後到達的面板', () => {
    expect(resolvePanel('questionnaire', { hasQuestionnaire: false })).toBe('home');
    expect(resolvePanel('plan', { hasQuestionnaire: true })).toBe('questionnaire');
    expect(resolvePanel('nope', { hasQuestionnaire: false })).toBe('home');
  });
});
