import { creditsText, type CostCheck } from '@templeyard/shared';
import { useEffect, useId, useRef } from 'react';
import { Button } from '../../components/Button';
import styles from './ConsentDialog.module.css';

export type ConsentDialogProps = {
  check: CostCheck;
  /** 同意的按鈕文字，例如「同意並產生」「同意並重生」 */
  confirmLabel: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  /** 已用與預留算在哪裡：「這支影片」，或系列角色庫的「這個系列的角色庫」 */
  scopeLabel?: string;
};

/** 費用確認：列出這次的預估與需要同意的原因；同意後才送出（F19） */
export function ConsentDialog({ check, confirmLabel, busy, error, onConfirm, onCancel, scopeLabel = '這支影片' }: ConsentDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const { estimate, budget } = check;
  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 id={titleId} className={styles.title}>
        費用確認
      </h2>
      <p className={styles.estimate}>這次預估：{creditsText(estimate.credits)}</p>
      <ul className={styles.reasons}>
        {check.consent.reasons.map((reason) => (
          <li key={reason.code}>{reason.message}</li>
        ))}
      </ul>
      <p className={styles.budget}>
        {scopeLabel}已用 {creditsText(budget.spent)}，預留 {creditsText(budget.reserved)}
        {budget.limit !== null && `，上限 ${creditsText(budget.limit)}`}
      </p>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <Button onClick={onCancel} disabled={busy}>
          取消
        </Button>
        <Button variant="primary" onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
