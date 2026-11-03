import type { Shot, ShotPatch } from '@templeyard/shared';

// 細修頁的編輯狀態：只送出改到的欄位；切換到其他格前提醒還沒儲存的修改

export type ShotDraft = Pick<
  Shot,
  | 'description'
  | 'actionStart'
  | 'actionEnd'
  | 'dialogue'
  | 'speaker'
  | 'subtitle'
  | 'durationSec'
  | 'shotSize'
  | 'cameraMove'
  | 'cameraSpeed'
  | 'cameraAngle'
  | 'viewKey'
  | 'lighting'
  | 'characters'
  | 'photoId'
  | 'keyframesEnabled'
  | 'keyframeTimes'
> & {
  /** 生成設定：沒有設定過的格子是使用原生語音、1 張候選圖 */
  nativeVoice: boolean;
  candidateCount: number;
};

const FIELDS = [
  'description',
  'actionStart',
  'actionEnd',
  'dialogue',
  'speaker',
  'subtitle',
  'durationSec',
  'shotSize',
  'cameraMove',
  'cameraSpeed',
  'cameraAngle',
  'viewKey',
  'lighting',
  'characters',
  'photoId',
  'keyframesEnabled',
  'keyframeTimes',
  'nativeVoice',
  'candidateCount',
] as const satisfies readonly (keyof ShotDraft)[];

/** 生成設定沒有設定過時的值 */
const SETTING_DEFAULTS = { nativeVoice: true, candidateCount: 1 } as const;

function valueOf(shot: Shot, key: (typeof FIELDS)[number]): unknown {
  if (key === 'nativeVoice') return shot.nativeVoice ?? SETTING_DEFAULTS.nativeVoice;
  if (key === 'candidateCount') return shot.candidateCount ?? SETTING_DEFAULTS.candidateCount;
  return shot[key];
}

/** 從這一格建立編輯狀態 */
export function draftFromShot(shot: Shot): ShotDraft {
  return Object.fromEntries(
    FIELDS.map((key) => {
      const value = valueOf(shot, key);
      return [key, Array.isArray(value) ? [...(value as unknown[])] : value];
    }),
  ) as ShotDraft;
}

function same(a: unknown, b: unknown, unordered: boolean): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    const left = unordered ? [...a].sort() : a;
    const right = unordered ? [...b].sort() : b;
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return a === b;
}

/** 和這一格不同的欄位（角色與時間點比較內容，不看順序） */
export function patchFrom(shot: Shot, draft: ShotDraft): ShotPatch {
  const patch: Record<string, unknown> = {};
  for (const key of FIELDS) {
    if (!same(valueOf(shot, key), draft[key], key === 'characters' || key === 'keyframeTimes')) patch[key] = draft[key];
  }
  return patch as ShotPatch;
}

/** 有沒有還沒儲存的修改 */
export function isDirty(shot: Shot, draft: ShotDraft): boolean {
  return Object.keys(patchFrom(shot, draft)).length > 0;
}

/** 圈選範圍的百分比輸入（0～100）轉成比例（0～1） */
export function percentBox(percent: { left: number; top: number; width: number; height: number }): { x: number; y: number; width: number; height: number } {
  return { x: percent.left / 100, y: percent.top / 100, width: percent.width / 100, height: percent.height / 100 };
}
