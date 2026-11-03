import type { Shot } from '@templeyard/shared';

// 精緻圖（refined-frame 節點）的變數與連續性鎖（第 9 階段生成時使用；第 8 階段先確定鎖會帶進指令）

export type FrameCharacter = { name: string; continuityLocks: readonly string[] };

/** 這一格要逐字帶入的連續性鎖：出現的角色的鎖，加上寺廟定裝版的外觀規範；不重複 */
export function frameLocks(_characters: readonly FrameCharacter[], _appearanceLocks: readonly string[]): string[] {
  throw new Error('尚未實作');
}

/**
 * refined-frame 節點的變數（prompt-studio/prompts/refined-frame.json）：
 * shot.*、frame.role（首格／末格）、frame.state（首格用起點、末格用終點）、character.locks（以「; 」連接）、
 * view.name、temple.appearanceLocks、shot.lighting、references、series.style
 */
export function refinedFrameVariables(_input: {
  shot: Pick<Shot, 'seq' | 'description' | 'actionStart' | 'actionEnd' | 'shotSize' | 'cameraAngle' | 'lighting'>;
  role: 'first' | 'last';
  characters: readonly FrameCharacter[];
  viewName: string;
  appearanceLocks: readonly string[];
  references: readonly string[];
  seriesStyle: string;
}): Record<string, unknown> {
  throw new Error('尚未實作');
}
