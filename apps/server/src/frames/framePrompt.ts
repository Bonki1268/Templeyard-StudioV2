import type { Shot } from '@templeyard/shared';

// 精緻圖（refined-frame 節點）的變數與連續性鎖（第 9 階段生成時使用；第 8 階段先確定鎖會帶進指令）

export type FrameCharacter = { name: string; continuityLocks: readonly string[] };

/** 這一格要逐字帶入的連續性鎖：出現的角色的鎖，加上寺廟定裝版的外觀規範；不重複 */
export function frameLocks(characters: readonly FrameCharacter[], appearanceLocks: readonly string[]): string[] {
  return [...new Set([...characters.flatMap((c) => c.continuityLocks), ...appearanceLocks].map((lock) => lock.trim()).filter(Boolean))];
}

/**
 * refined-frame 節點的變數（prompt-studio/prompts/refined-frame.json）：
 * shot.*、frame.role（首格／末格）、frame.state（首格用起點、末格用終點）、character.locks（以「; 」連接）、
 * view.name、temple.appearanceLocks、shot.lighting、references、series.style
 */
export function refinedFrameVariables(input: {
  shot: Pick<Shot, 'seq' | 'description' | 'actionStart' | 'actionEnd' | 'shotSize' | 'cameraAngle' | 'lighting'>;
  role: 'first' | 'last';
  characters: readonly FrameCharacter[];
  viewName: string;
  appearanceLocks: readonly string[];
  references: readonly string[];
  seriesStyle: string;
}): Record<string, unknown> {
  const { shot } = input;
  return {
    shot: {
      seq: shot.seq,
      description: shot.description,
      shotSize: shot.shotSize,
      cameraAngle: shot.cameraAngle,
      characters: input.characters.map((c) => c.name).join('、'),
      lighting: shot.lighting,
    },
    frame: {
      role: input.role === 'first' ? '首格' : '末格',
      // 末格沒有寫終點時沿用起點
      state: input.role === 'first' ? shot.actionStart : shot.actionEnd || shot.actionStart,
    },
    character: { locks: frameLocks(input.characters, []).join('; ') },
    view: { name: input.viewName, reference: '' },
    temple: { appearanceLocks: input.appearanceLocks.join('; ') },
    photo: { description: '' },
    references: input.references.join('；'),
    series: { style: input.seriesStyle },
    instruction: '',
  };
}
