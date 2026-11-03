import type { CostCheck, CostItem } from '@templeyard/shared';
import { useState, type ReactNode } from 'react';
import { ApiRequestError, ConsentRequiredError, postConsent, postCostEstimate } from '../../api/client';
import { ConsentDialog } from './ConsentDialog';

type Pending = {
  items: CostItem[];
  check: CostCheck;
  confirmLabel: string;
  run: (consentToken: string | undefined) => Promise<void>;
};

export type AskConsent = {
  items: CostItem[];
  confirmLabel: string;
  /** 送出這次生成；不需要同意時 consentToken 為 undefined */
  run: (consentToken: string | undefined) => Promise<void>;
};

function messageOf(error: unknown): string {
  return error instanceof ApiRequestError ? error.message : '送出失敗，請再試一次。';
}

/**
 * 付費生成前的流程：先預估；需要同意時顯示費用確認，同意後取得同意憑證再送出；不需要同意就直接送出。
 * 回傳 ask（開始流程）、dialog（放在頁面上）、error（送出失敗的原因）。
 */
export function useCostConsent(videoId: string): { ask: (request: AskConsent) => Promise<void>; dialog: ReactNode; error: string | null; busy: boolean } {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  async function ask(request: AskConsent) {
    setError(null);
    setBusy(true);
    try {
      const check = await postCostEstimate(videoId, request.items);
      if (check.consent.required) {
        setDialogError(null);
        setPending({ ...request, check });
        return;
      }
      await request.run(undefined);
    } catch (cause: unknown) {
      // 預估之後條件變了（例如別的生成用掉了額度）：改成請使用者同意
      if (cause instanceof ConsentRequiredError) setPending({ ...request, check: cause.check });
      else setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setDialogError(null);
    try {
      const token = await postConsent(videoId, pending.items);
      await pending.run(token);
      setPending(null);
    } catch (cause: unknown) {
      if (cause instanceof ConsentRequiredError) setPending({ ...pending, check: cause.check });
      setDialogError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  const dialog = pending ? (
    <ConsentDialog
      check={pending.check}
      confirmLabel={pending.confirmLabel}
      busy={busy}
      error={dialogError}
      onConfirm={() => void confirm()}
      onCancel={() => setPending(null)}
    />
  ) : null;

  return { ask, dialog, error, busy };
}
