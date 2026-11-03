// 創作工作區的面板（03「/videos/:vid/studio?panel=…」）：到達過的面板可以切回，還沒到達的不能選並說明原因

export const STUDIO_PANELS = [
  { key: 'home', label: '創作首頁' },
  { key: 'questionnaire', label: '設定問卷' },
  { key: 'plan', label: '分鏡方案' },
  { key: 'frames', label: '精緻圖' },
  { key: 'final', label: '成品' },
] as const;

export type StudioPanel = (typeof STUDIO_PANELS)[number]['key'];

export const PANEL_NOT_REACHED = '還沒到這一步';

export type StudioProgress = { hasQuestionnaire: boolean };

/** 到達過的面板：創作首頁一定可以；Agent 開啟問卷後可以看問卷；分鏡方案之後的面板在之後的階段才會到達 */
export function reachablePanels(_progress: StudioProgress): StudioPanel[] {
  throw new Error('尚未實作');
}

/** 要顯示的面板：網址指定而且到達過就用它；否則顯示最後到達的面板 */
export function resolvePanel(_requested: string | null, _progress: StudioProgress): StudioPanel {
  throw new Error('尚未實作');
}
