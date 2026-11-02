import type { DeidBox } from '@templeyard/shared';
import type { DetectedFace } from './faceDetector';

// 遮蔽框的操作（純函式）：自動偵測的框只能取消或恢復；手動加的框可以刪除。

export type BoxRect = Pick<DeidBox, 'x' | 'y' | 'width' | 'height'>;

/** 「新增遮蔽框」的預設位置：照片正中央 */
export const DEFAULT_MANUAL_BOX: BoxRect = { x: 0.4, y: 0.4, width: 0.2, height: 0.2 };

/** 「新增車牌遮蔽」的預設位置：照片下方中間 */
export const DEFAULT_PLATE_BOX: BoxRect = { x: 0.35, y: 0.75, width: 0.3, height: 0.1 };

/** 框的寬高至少 1% */
const MIN_SIZE = 0.01;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** 限制在照片範圍內：先把大小限制在 1%～100%，再把位置推回照片內 */
function fitInside(rect: BoxRect): BoxRect {
  const width = clamp(rect.width, MIN_SIZE, 1);
  const height = clamp(rect.height, MIN_SIZE, 1);
  return { x: clamp(rect.x, 0, 1 - width), y: clamp(rect.y, 0, 1 - height), width, height };
}

/** 偵測結果變成自動遮蔽框（id 為 auto-1、auto-2…） */
export function boxesFromDetections(faces: readonly DetectedFace[]): DeidBox[] {
  return faces.map((face, i) => ({
    id: `auto-${i + 1}`,
    kind: 'face',
    source: 'auto',
    ...fitInside(face),
    cancelled: false,
  }));
}

/** 新增手動框：face 放在正中央、plate 放在下方中間；id 不和現有的重複 */
export function addManualBox(boxes: readonly DeidBox[], kind: DeidBox['kind']): DeidBox[] {
  const used = new Set(boxes.map((box) => box.id));
  let n = 1;
  while (used.has(`manual-${n}`)) n += 1;
  const rect = kind === 'plate' ? DEFAULT_PLATE_BOX : DEFAULT_MANUAL_BOX;
  return [...boxes, { id: `manual-${n}`, kind, source: 'manual', ...rect, cancelled: false }];
}

/** 取消或恢復自動偵測的框；手動框不受影響 */
export function toggleCancelled(boxes: readonly DeidBox[], id: string): DeidBox[] {
  return boxes.map((box) => (box.id === id && box.source === 'auto' ? { ...box, cancelled: !box.cancelled } : box));
}

/** 刪除手動框；自動偵測的框不能刪除（只能取消） */
export function removeBox(boxes: readonly DeidBox[], id: string): DeidBox[] {
  return boxes.filter((box) => !(box.id === id && box.source === 'manual'));
}

/** 調整位置或大小；結果限制在照片範圍內（先縮小大小，再推回位置） */
export function adjustBox(boxes: readonly DeidBox[], id: string, patch: Partial<BoxRect>): DeidBox[] {
  return boxes.map((box) => (box.id === id ? { ...box, ...fitInside({ ...box, ...patch }) } : box));
}

/** 真的要遮蔽的框（排除已取消的） */
export function activeBoxes(boxes: readonly DeidBox[]): DeidBox[] {
  return boxes.filter((box) => !box.cancelled);
}

export type LabeledBox = { box: DeidBox; name: string; sourceLabel: '自動偵測' | '手動' };

/**
 * 給人看的名稱：自動偵測的臉「臉孔 N」、手動的臉「遮蔽框 N」、車牌「車牌 N」，
 * 各自依清單順序編號。
 */
export function labelBoxes(boxes: readonly DeidBox[]): LabeledBox[] {
  const counters = { 臉孔: 0, 遮蔽框: 0, 車牌: 0 };
  return boxes.map((box) => {
    const prefix = box.kind === 'plate' ? '車牌' : box.source === 'auto' ? '臉孔' : '遮蔽框';
    counters[prefix] += 1;
    return { box, name: `${prefix} ${counters[prefix]}`, sourceLabel: box.source === 'auto' ? '自動偵測' : '手動' };
  });
}
