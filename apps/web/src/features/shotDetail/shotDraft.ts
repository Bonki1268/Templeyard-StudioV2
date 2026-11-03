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
>;

/** 從這一格建立編輯狀態 */
export function draftFromShot(_shot: Shot): ShotDraft {
  throw new Error('尚未實作');
}

/** 和這一格不同的欄位（角色與時間點比較內容，不看順序） */
export function patchFrom(_shot: Shot, _draft: ShotDraft): ShotPatch {
  throw new Error('尚未實作');
}

/** 有沒有還沒儲存的修改 */
export function isDirty(_shot: Shot, _draft: ShotDraft): boolean {
  throw new Error('尚未實作');
}

/** 圈選範圍的百分比輸入（0～100）轉成比例（0～1） */
export function percentBox(_percent: { left: number; top: number; width: number; height: number }): { x: number; y: number; width: number; height: number } {
  throw new Error('尚未實作');
}
