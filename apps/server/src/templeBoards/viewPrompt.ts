import type { TempleViewSource } from '@templeyard/shared';

// temple-view 節點的變數（prompt-studio/prompts/temple-view.json 的變數清單）

export type ViewPromptInput = {
  temple: { name: string; district: string; deity: string };
  series: { visualStyle: string };
  view: { key: string; name: string; source: TempleViewSource };
  /** 依送入順序的參考照片：拍到哪個視角（沒有指定時為 null） */
  references: readonly { viewName: string | null }[];
  appearanceLocks: readonly string[];
  lighting: string;
  instruction: string | null;
};

/**
 * 組出 temple-view 的變數：
 * - view.source：依照片／AI 推測
 * - photos：「Image 1（地理、建築外觀）：廟前全景；Image 2（建築外觀）：廟埕」——這個視角自己的照片負責地理與建築外觀，
 *   其他視角的照片只負責建築外觀；AI 推測的視角開頭說明沒有這個視角的照片
 * - temple.appearanceLocks：以「; 」連接，逐字帶入
 */
export function templeViewVariables(_input: ViewPromptInput): Record<string, unknown> {
  throw new Error('尚未實作');
}
