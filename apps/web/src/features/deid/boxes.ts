import type { DeidBox } from '@templeyard/shared';
import type { DetectedFace } from './faceDetector';

// 遮蔽框的操作（純函式）：自動偵測的框只能取消或恢復；手動加的框可以刪除。

export type BoxRect = Pick<DeidBox, 'x' | 'y' | 'width' | 'height'>;

/** 「新增遮蔽框」的預設位置：照片正中央 */
export const DEFAULT_MANUAL_BOX: BoxRect = { x: 0.4, y: 0.4, width: 0.2, height: 0.2 };

/** 「新增車牌遮蔽」的預設位置：照片下方中間 */
export const DEFAULT_PLATE_BOX: BoxRect = { x: 0.35, y: 0.75, width: 0.3, height: 0.1 };

/** 偵測結果變成自動遮蔽框（id 為 auto-1、auto-2…） */
export function boxesFromDetections(_faces: readonly DetectedFace[]): DeidBox[] {
  throw new Error('尚未實作');
}

/** 新增手動框：face 放在正中央、plate 放在下方中間；id 不和現有的重複 */
export function addManualBox(_boxes: readonly DeidBox[], _kind: DeidBox['kind']): DeidBox[] {
  throw new Error('尚未實作');
}

/** 取消或恢復自動偵測的框；手動框不受影響 */
export function toggleCancelled(_boxes: readonly DeidBox[], _id: string): DeidBox[] {
  throw new Error('尚未實作');
}

/** 刪除手動框；自動偵測的框不能刪除（只能取消） */
export function removeBox(_boxes: readonly DeidBox[], _id: string): DeidBox[] {
  throw new Error('尚未實作');
}

/** 調整位置或大小；結果限制在照片範圍內（先縮小大小，再推回位置） */
export function adjustBox(_boxes: readonly DeidBox[], _id: string, _patch: Partial<BoxRect>): DeidBox[] {
  throw new Error('尚未實作');
}

/** 真的要遮蔽的框（排除已取消的） */
export function activeBoxes(_boxes: readonly DeidBox[]): DeidBox[] {
  throw new Error('尚未實作');
}

export type LabeledBox = { box: DeidBox; name: string; sourceLabel: '自動偵測' | '手動' };

/**
 * 給人看的名稱：自動偵測的臉「臉孔 N」、手動的臉「遮蔽框 N」、車牌「車牌 N」，
 * 各自依清單順序編號。
 */
export function labelBoxes(_boxes: readonly DeidBox[]): LabeledBox[] {
  throw new Error('尚未實作');
}
