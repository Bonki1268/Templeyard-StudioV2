import { Check } from 'lucide-react';
import { CREATE_VIDEO_STEPS, type CreateVideoStep } from './createVideoSteps';
import styles from './StepBar.module.css';

/** 步驟列：選寺廟 → 選模型 → 上傳照片 → 定裝版；目前步驟以 aria-current="step" 標示 */
export function StepBar({ current }: { current: CreateVideoStep }) {
  const currentIndex = CREATE_VIDEO_STEPS.indexOf(current);
  return (
    <ol className={styles.steps} aria-label="建立影片的步驟">
      {CREATE_VIDEO_STEPS.map((step, index) => {
        const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo';
        return (
          <li key={step} className={`${styles.step} ${styles[state]}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className={styles.number} aria-hidden="true">
              {state === 'done' ? <Check size={14} strokeWidth={2.2} /> : index + 1}
            </span>
            {step}
            {state === 'done' && <span className={styles.visuallyHidden}>（已完成）</span>}
          </li>
        );
      })}
    </ol>
  );
}
