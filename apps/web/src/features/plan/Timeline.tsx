import { formatClock, moveBoundary } from '@templeyard/shared';
import type { KeyboardEvent, PointerEvent } from 'react';
import { useRef } from 'react';
import styles from './Timeline.module.css';

// 時間軸條：依秒數比例分格，顯示每格時間區間與「總長度／目標長度」；拖曳（或用方向鍵移動）格與格的邊界調整秒數

export type TimelineProps = {
  shots: readonly { shotKey: string; seq: number; startSec: number; durationSec: number }[];
  totalSec: number;
  targetSec: number;
  /** 邊界移動後每一格的秒數 */
  onChange: (durations: number[]) => void;
  disabled?: boolean;
};

export function Timeline({ shots, totalSec, targetSec, onChange, disabled = false }: TimelineProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const durations = shots.map((shot) => shot.durationSec);
  const scale = Math.max(totalSec, targetSec, 1);
  const over = totalSec > targetSec;

  function move(boundary: number, delta: number) {
    if (disabled || delta === 0) return;
    const next = moveBoundary(durations, boundary, delta);
    if (next.some((value, index) => value !== durations[index])) onChange(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>, boundary: number) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') move(boundary, 1);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') move(boundary, -1);
    else return;
    event.preventDefault();
  }

  /** 拖曳邊界：依滑鼠位置換算成秒數 */
  function onPointerDown(event: PointerEvent<HTMLDivElement>, boundary: number) {
    if (disabled || !barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const start = shots[boundary]?.startSec ?? 0;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      const sec = Math.round(((moveEvent.clientX - rect.left) / rect.width) * scale);
      move(boundary, sec - (start + (durations[boundary] ?? 0)));
    };
    const stop = () => {
      target.removeEventListener('pointermove', handleMove);
      target.removeEventListener('pointerup', stop);
    };
    target.addEventListener('pointermove', handleMove);
    target.addEventListener('pointerup', stop);
  }

  return (
    <section className={styles.timeline} aria-label="時間軸">
      <div className={styles.summary}>
        <span>{`總長度 ${totalSec} 秒／目標長度 ${targetSec} 秒`}</span>
        {over && <span className={styles.over}>超過目標長度</span>}
      </div>
      <div className={styles.bar} ref={barRef}>
        <ol className={styles.segments}>
          {shots.map((shot) => (
            <li key={shot.shotKey} className={styles.segment} style={{ width: `${(shot.durationSec / scale) * 100}%` }}>
              <span className={styles.segmentLabel}>{shot.seq}</span>
              <span className={styles.segmentTime}>
                {formatClock(shot.startSec)}–{formatClock(shot.startSec + shot.durationSec)}
              </span>
            </li>
          ))}
        </ol>
        {shots.slice(0, -1).map((shot, index) => {
          const at = shot.startSec + shot.durationSec;
          return (
            <div
              key={`boundary-${shot.shotKey}`}
              role="slider"
              tabIndex={disabled ? -1 : 0}
              aria-label={`第 ${shot.seq}、${shot.seq + 1} 格的邊界`}
              aria-valuemin={shot.startSec + 1}
              aria-valuemax={at + (shots[index + 1]?.durationSec ?? 1) - 1}
              aria-valuenow={at}
              aria-valuetext={`${formatClock(at)}，第 ${shot.seq} 格 ${shot.durationSec} 秒`}
              aria-disabled={disabled || undefined}
              className={styles.handle}
              style={{ left: `${(at / scale) * 100}%` }}
              onKeyDown={(event) => onKeyDown(event, index)}
              onPointerDown={(event) => onPointerDown(event, index)}
            />
          );
        })}
      </div>
    </section>
  );
}
