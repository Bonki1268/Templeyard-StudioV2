import type { DeidBox, Photo } from '@templeyard/shared';
import { useEffect, useId, useRef, useState, type PointerEvent } from 'react';
import { ApiRequestError, assetUrl } from '../../api/client';
import { Button } from '../../components/Button';
import { Tag } from '../../components/Tag';
import {
  addManualBox,
  adjustBox,
  labelBoxes,
  removeBox,
  toggleCancelled,
  type BoxRect,
  type LabeledBox,
} from '../deid/boxes';
import styles from './MaskEditor.module.css';
import { saveMasks } from './processPhoto';

type MaskEditorProps = {
  videoId: string;
  photo: Photo;
  name: string;
  onClose: () => void;
  onSaved: (photo: Photo) => void;
};

/** 小於這個大小的拖曳不算畫框（避免單純點一下就多出一個框） */
const MIN_DRAW_SIZE = 0.01;

const toPercent = (ratio: number) => Math.round(ratio * 1000) / 10;

/**
 * 遮蔽編輯：顯示本機原圖與遮蔽框；可新增、刪除、調整框，或取消誤判（例如神像的臉）。
 * 儲存時在瀏覽器重新產生去識別後的圖。
 */
export function MaskEditor({ videoId, photo, name, onClose, onSaved }: MaskEditorProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [boxes, setBoxes] = useState<DeidBox[]>(photo.deidBoxes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<BoxRect | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const labeled = labelBoxes(boxes);

  function pointFrom(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  }

  function rectFrom(a: { x: number; y: number }, b: { x: number; y: number }): BoxRect {
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      onSaved(await saveMasks(videoId, photo, boxes));
    } catch (cause: unknown) {
      setError(cause instanceof ApiRequestError ? `儲存失敗：${cause.message}` : '儲存失敗，請再試一次。');
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Esc 等同「不儲存，關閉」
        event.preventDefault();
        onClose();
      }}
    >
      <h2 id={titleId} className={styles.title}>
        調整遮蔽：{name}
      </h2>
      <p className={styles.hint}>
        神像的臉被誤判時，按「取消遮蔽」；沒偵測到的臉或車牌，按下方按鈕加上遮蔽框，或直接在照片上拖曳畫框。這裡顯示的原圖只存在這台電腦。
      </p>

      <div
        className={styles.preview}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drawStart.current = pointFrom(event);
          setDraft({ ...drawStart.current, width: 0, height: 0 });
        }}
        onPointerMove={(event) => {
          if (drawStart.current) setDraft(rectFrom(drawStart.current, pointFrom(event)));
        }}
        onPointerUp={() => {
          if (draft && draft.width >= MIN_DRAW_SIZE && draft.height >= MIN_DRAW_SIZE) {
            const added = addManualBox(boxes, 'face');
            const box = added.at(-1);
            setBoxes(box ? adjustBox(added, box.id, draft) : added);
          }
          drawStart.current = null;
          setDraft(null);
        }}
      >
        <img className={styles.image} src={assetUrl(photo.originalAssetId)} alt={`${name}的原圖`} draggable={false} />
        {labeled.map(({ box, name: boxName }) => (
          <div
            key={box.id}
            className={`${styles.overlay} ${box.cancelled ? styles.overlayCancelled : ''}`}
            style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }}
            aria-hidden="true"
          >
            <span className={styles.overlayLabel}>{boxName}</span>
          </div>
        ))}
        {draft && (
          <div
            className={`${styles.overlay} ${styles.overlayDraft}`}
            style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: `${draft.width * 100}%`, height: `${draft.height * 100}%` }}
            aria-hidden="true"
          />
        )}
      </div>

      <div className={styles.tools}>
        <Button onClick={() => setBoxes(addManualBox(boxes, 'face'))}>新增遮蔽框</Button>
        <Button onClick={() => setBoxes(addManualBox(boxes, 'plate'))}>新增車牌遮蔽</Button>
      </div>

      {boxes.length === 0 && <p className={styles.hint}>目前沒有遮蔽框。</p>}
      <ul className={styles.list} aria-label="遮蔽框清單">
        {labeled.map((item) => (
          <li key={item.box.id}>
            <BoxControls
              item={item}
              onToggle={() => setBoxes(toggleCancelled(boxes, item.box.id))}
              onRemove={() => setBoxes(removeBox(boxes, item.box.id))}
              onAdjust={(patch) => setBoxes(adjustBox(boxes, item.box.id, patch))}
            />
          </li>
        ))}
      </ul>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.footer}>
        <Button onClick={onClose} disabled={saving}>
          不儲存，關閉
        </Button>
        <Button variant="primary" onClick={() => void save()} disabled={saving} aria-busy={saving}>
          儲存遮蔽
        </Button>
      </div>
    </dialog>
  );
}

const FIELDS: { key: keyof BoxRect; label: string }[] = [
  { key: 'x', label: '左（%）' },
  { key: 'y', label: '上（%）' },
  { key: 'width', label: '寬（%）' },
  { key: 'height', label: '高（%）' },
];

function BoxControls({
  item,
  onToggle,
  onRemove,
  onAdjust,
}: {
  item: LabeledBox;
  onToggle: () => void;
  onRemove: () => void;
  onAdjust: (patch: Partial<BoxRect>) => void;
}) {
  const { box, name, sourceLabel } = item;
  return (
    <fieldset className={styles.box}>
      <legend className={styles.boxName}>
        {name}（{sourceLabel}）
      </legend>
      <div className={styles.boxRow}>
        {box.cancelled && <Tag tone="warning">已取消</Tag>}
        <div className={styles.fields}>
          {FIELDS.map((field) => (
            <label key={field.key} className={styles.field}>
              {field.label}
              <input
                className={styles.number}
                type="number"
                min={0}
                max={100}
                step={1}
                value={toPercent(box[field.key])}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (event.target.value === '' || Number.isNaN(value)) return;
                  onAdjust({ [field.key]: value / 100 });
                }}
              />
            </label>
          ))}
        </div>
        {box.source === 'auto' ? (
          <Button aria-label={`${box.cancelled ? '恢復遮蔽' : '取消遮蔽'}：${name}`} onClick={onToggle}>
            {box.cancelled ? '恢復遮蔽' : '取消遮蔽'}
          </Button>
        ) : (
          <Button aria-label={`刪除：${name}`} onClick={onRemove}>
            刪除
          </Button>
        )}
      </div>
    </fieldset>
  );
}
