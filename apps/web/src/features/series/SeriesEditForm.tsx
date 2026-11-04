import type { Series } from '@templeyard/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { ApiRequestError, patchSeries } from '../../api/client';
import { Button } from '../../components/Button';
import styles from './SeriesCreateForm.module.css';
import { SeriesFields } from './SeriesFields';
import { pendingItems, pendingMessage, seriesFormFrom, toUpdateSeriesInput, type SeriesFormState } from './seriesForm';
import { SERIES_LIST_KEY } from './useSeriesList';

/** 修改系列設定（使用者 2026-11-05 提出）：只影響之後新增的影片 */
export function SeriesEditForm({ series, titleId, onDone }: { series: Series; titleId: string; onDone: () => void }) {
  const [form, setForm] = useState<SeriesFormState>(() => seriesFormFrom(series));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const noteId = useId();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => patchSeries(series.id, toUpdateSeriesInput(form)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SERIES_LIST_KEY });
      onDone();
    },
    onError: (error) => setFieldErrors(error instanceof ApiRequestError ? error.fieldErrors : {}),
  });

  const update = (patch: Partial<SeriesFormState>) => setForm((current) => ({ ...current, ...patch }));
  const pending = pendingItems(form);
  const note = pendingMessage(pending);
  const formError = mutation.isError && Object.keys(fieldErrors).length === 0 ? mutation.error.message : undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending.length > 0 || mutation.isPending) return;
    mutation.mutate();
  };

  return (
    <form className={styles.form} aria-labelledby={titleId} onSubmit={submit} noValidate>
      <div className={styles.body}>
        <p className={styles.intro}>修改後只影響之後新增的影片。</p>
        <SeriesFields form={form} update={update} fieldErrors={fieldErrors} seriesId={series.id} />
        {formError && (
          <p className={styles.alert} role="alert">
            {formError}
          </p>
        )}
        {note && (
          <p id={noteId} className={styles.note}>
            {note}
          </p>
        )}
        <div className={styles.actions}>
          <Button type="button" disabled={mutation.isPending} onClick={onDone}>
            取消
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={pending.length > 0 || mutation.isPending}
            aria-describedby={note ? noteId : undefined}
            aria-busy={mutation.isPending || undefined}
          >
            儲存系列設定
          </Button>
        </div>
      </div>
    </form>
  );
}
