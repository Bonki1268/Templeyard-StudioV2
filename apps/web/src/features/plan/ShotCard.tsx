import { SHOT_SIZES, missingViewName, shotTitle, type Shot, type ShotCheck, type ShotInput } from '@templeyard/shared';
import { useState, type DragEvent } from 'react';
import { Button } from '../../components/Button';
import { Tag } from '../../components/Tag';
import styles from './PlanPanel.module.css';

type ShotCardProps = {
  shot: Shot;
  check: ShotCheck | undefined;
  views: readonly { viewKey: string; viewName: string }[];
  index: number;
  count: number;
  /** 檢視舊版本時不能改 */
  readOnly: boolean;
  busy: boolean;
  /** 改了這一格的欄位（文字在離開欄位時才送出） */
  onChange: (patch: Partial<ShotInput>) => void;
  onMove: (to: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDrop: () => void;
};

type TextKey = 'description' | 'dialogue' | 'subtitle';

function isControl(target: EventTarget): boolean {
  return target instanceof Element && target.closest('textarea, input, select, button, a, label') !== null;
}

const TEXT_FIELDS: { key: TextKey; label: string }[] = [
  { key: 'description', label: '畫面內容' },
  { key: 'dialogue', label: '台詞或旁白' },
  { key: 'subtitle', label: '字幕' },
];

/** 分鏡卡片：序號與時間、景別與運鏡、場景視角、畫面內容、台詞、字幕；可排序、複製、刪除 */
export function ShotCard({ shot, check, views, index, count, readOnly, busy, onChange, onMove, onDuplicate, onRemove, onDragStart, onDrop }: ShotCardProps) {
  const name = `第 ${shot.seq} 格`;
  const [texts, setTexts] = useState<Record<TextKey, string>>({ description: shot.description, dialogue: shot.dialogue, subtitle: shot.subtitle });
  const missing = missingViewName(shot.viewKey);
  const disabled = readOnly || busy;

  function commit(key: TextKey) {
    if (texts[key] !== shot[key]) onChange({ [key]: texts[key] });
  }

  return (
    <article
      className={`${styles.card} ${check?.dialogueOverflow ? styles.cardError : ''}`}
      aria-label={name}
      draggable={!disabled}
      // 備援：瀏覽器沒有啟動 HTML5 拖曳時（例如按住後直接移到別的卡片放開），用滑鼠按下與放開完成排序；
      // 從輸入框、選單、按鈕開始的不算，才不會干擾選取文字
      onMouseDown={(event) => {
        if (!disabled && !isControl(event.target)) onDragStart();
      }}
      onMouseUp={() => {
        if (!disabled) onDrop();
      }}
      onDragStart={(event: DragEvent) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(index));
        onDragStart();
      }}
      onDragOver={(event) => {
        if (!disabled) event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (!disabled) onDrop();
      }}
    >
      <div className={styles.cardMain}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>{shotTitle(shot)}</h3>
        <div className={styles.tags}>
          {missing && <Tag tone="warning">{`缺少視角：${missing}`}</Tag>}
          {check?.dialogueOverflow && <Tag tone="error">對白放不下</Tag>}
        </div>
      </div>

      <div className={styles.row}>
        <label className={styles.field}>
          <span>{`${name}的景別`}</span>
          <select aria-label={`${name}的景別`} value={shot.shotSize} disabled={disabled} onChange={(event) => onChange({ shotSize: event.target.value as ShotInput['shotSize'] })}>
            {SHOT_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <p className={styles.meta}>運鏡：{shot.cameraMove || '固定'}</p>
        <label className={styles.field}>
          <span>{`${name}的場景視角`}</span>
          <select aria-label={`${name}的場景視角`} value={shot.viewKey} disabled={disabled} onChange={(event) => onChange({ viewKey: event.target.value })}>
            {shot.viewKey === '' && <option value="">請選擇視角</option>}
            {missing && <option value={shot.viewKey}>{`${missing}（定裝版沒有）`}</option>}
            {views.map((view) => (
              <option key={view.viewKey} value={view.viewKey}>
                {view.viewName}
              </option>
            ))}
          </select>
        </label>
      </div>

      {check?.dialogueEstimateSec !== null && check?.dialogueEstimateSec !== undefined && (
        <p className={check.dialogueOverflow ? styles.error : styles.meta}>
          {check.dialogueOverflow
            ? `對白估時 ${check.dialogueEstimateSec.toFixed(1)} 秒，這一格只有 ${shot.durationSec} 秒：請延長秒數或拆成兩格，不要加快語速`
            : `對白估時 ${check.dialogueEstimateSec.toFixed(1)} 秒（暫估）`}
        </p>
      )}
      {check?.shortWarning && <p className={styles.warning}>{check.shortWarning}</p>}

      {!readOnly && (
        <div className={styles.cardActions}>
          <Button aria-label={`上移：${name}`} disabled={busy || index === 0} onClick={() => onMove(index - 1)}>
            上移
          </Button>
          <Button aria-label={`下移：${name}`} disabled={busy || index === count - 1} onClick={() => onMove(index + 1)}>
            下移
          </Button>
          <Button aria-label={`複製：${name}`} disabled={busy} onClick={onDuplicate}>
            複製
          </Button>
          <Button aria-label={`刪除：${name}`} disabled={busy || count <= 1} onClick={onRemove}>
            刪除
          </Button>
        </div>
      )}
      </div>

      <div className={styles.cardTexts}>
      {TEXT_FIELDS.map((field) => (
        <label key={field.key} className={styles.field}>
          <span>{`${name}的${field.label}`}</span>
          <textarea
            aria-label={`${name}的${field.label}`}
            rows={field.key === 'description' ? 2 : 1}
            value={texts[field.key]}
            disabled={disabled}
            onChange={(event) => setTexts((old) => ({ ...old, [field.key]: event.target.value }))}
            onBlur={() => commit(field.key)}
          />
        </label>
      ))}
      </div>
    </article>
  );
}
