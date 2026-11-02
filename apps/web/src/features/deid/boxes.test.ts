import type { DeidBox } from '@templeyard/shared';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MANUAL_BOX,
  DEFAULT_PLATE_BOX,
  activeBoxes,
  addManualBox,
  adjustBox,
  boxesFromDetections,
  labelBoxes,
  removeBox,
  toggleCancelled,
} from './boxes';

const face = (id: string, extra: Partial<DeidBox> = {}): DeidBox => ({
  id,
  kind: 'face',
  source: 'auto',
  x: 0.1,
  y: 0.1,
  width: 0.2,
  height: 0.2,
  cancelled: false,
  ...extra,
});

describe('偵測結果變成遮蔽框', () => {
  it('每張臉一個自動框，依序編號，一開始都沒有取消', () => {
    const boxes = boxesFromDetections([
      { x: 0.1, y: 0.2, width: 0.1, height: 0.15 },
      { x: 0.5, y: 0.5, width: 0.2, height: 0.2 },
    ]);
    expect(boxes).toEqual([
      { id: 'auto-1', kind: 'face', source: 'auto', x: 0.1, y: 0.2, width: 0.1, height: 0.15, cancelled: false },
      { id: 'auto-2', kind: 'face', source: 'auto', x: 0.5, y: 0.5, width: 0.2, height: 0.2, cancelled: false },
    ]);
  });

  it('沒有臉時沒有框', () => {
    expect(boxesFromDetections([])).toEqual([]);
  });
});

describe('新增手動框', () => {
  it('新增遮蔽框放在照片正中央', () => {
    const [box] = addManualBox([], 'face');
    expect(box).toMatchObject({ kind: 'face', source: 'manual', cancelled: false, ...DEFAULT_MANUAL_BOX });
  });

  it('新增車牌遮蔽放在照片下方中間', () => {
    const [box] = addManualBox([], 'plate');
    expect(box).toMatchObject({ kind: 'plate', source: 'manual', ...DEFAULT_PLATE_BOX });
  });

  it('新的框加在最後，id 不和現有的重複（刪掉中間的框之後也一樣）', () => {
    const two = addManualBox(addManualBox([], 'face'), 'face');
    const afterRemove = removeBox(two, two[0]?.id ?? '');
    const three = addManualBox(afterRemove, 'face');

    const ids = three.map((box) => box.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(three).toHaveLength(2);
  });

  it('不改動原本的陣列', () => {
    const original: DeidBox[] = [face('auto-1')];
    addManualBox(original, 'face');
    expect(original).toHaveLength(1);
  });
});

describe('取消與刪除', () => {
  it('自動偵測的框可以取消，再按一次恢復', () => {
    const cancelled = toggleCancelled([face('auto-1')], 'auto-1');
    expect(cancelled[0]?.cancelled).toBe(true);
    expect(toggleCancelled(cancelled, 'auto-1')[0]?.cancelled).toBe(false);
  });

  it('手動框不能取消（不受影響）', () => {
    const manual = addManualBox([], 'face');
    expect(toggleCancelled(manual, manual[0]?.id ?? '')).toEqual(manual);
  });

  it('手動框可以刪除', () => {
    const manual = addManualBox([face('auto-1')], 'plate');
    expect(removeBox(manual, manual[1]?.id ?? '').map((box) => box.id)).toEqual(['auto-1']);
  });

  it('自動偵測的框不能刪除，只能取消', () => {
    const boxes = [face('auto-1')];
    expect(removeBox(boxes, 'auto-1')).toEqual(boxes);
  });

  it('已取消的框不遮蔽', () => {
    const boxes = [face('auto-1', { cancelled: true }), face('auto-2')];
    expect(activeBoxes(boxes).map((box) => box.id)).toEqual(['auto-2']);
  });
});

describe('調整位置與大小', () => {
  it('改成指定的位置', () => {
    const [box] = adjustBox([face('auto-1')], 'auto-1', { x: 0.05, y: 0.3 });
    expect(box).toMatchObject({ x: 0.05, y: 0.3, width: 0.2, height: 0.2 });
  });

  it('超出右邊與下面時推回照片內', () => {
    const [box] = adjustBox([face('auto-1')], 'auto-1', { x: 0.95, y: 0.9 });
    expect(box?.x).toBeCloseTo(0.8);
    expect(box?.y).toBeCloseTo(0.8);
  });

  it('負的位置變成 0；比照片大的寬高縮成照片大小', () => {
    const [box] = adjustBox([face('auto-1')], 'auto-1', { x: -0.2, width: 1.5 });
    expect(box).toMatchObject({ x: 0, width: 1 });
  });

  it('寬高至少 1%', () => {
    const [box] = adjustBox([face('auto-1')], 'auto-1', { width: 0, height: -1 });
    expect(box).toMatchObject({ width: 0.01, height: 0.01 });
  });
});

describe('框的名稱', () => {
  it('自動偵測的臉、手動的框、車牌各自編號', () => {
    let boxes: DeidBox[] = [face('auto-1'), face('auto-2')];
    boxes = addManualBox(boxes, 'face');
    boxes = addManualBox(boxes, 'plate');
    boxes = addManualBox(boxes, 'face');

    expect(labelBoxes(boxes).map(({ name, sourceLabel }) => `${name}（${sourceLabel}）`)).toEqual([
      '臉孔 1（自動偵測）',
      '臉孔 2（自動偵測）',
      '遮蔽框 1（手動）',
      '車牌 1（手動）',
      '遮蔽框 2（手動）',
    ]);
  });
});
