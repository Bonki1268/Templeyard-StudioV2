import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { ApiRequestError, postSeries } from '../../api/client';
import { BottomActionBar } from '../../components/BottomActionBar';
import { Button } from '../../components/Button';
import styles from './SeriesCreateForm.module.css';
import { SeriesFields } from './SeriesFields';
import { initialSeriesForm, pendingItems, pendingMessage, toCreateSeriesInput, type SeriesFormState } from './seriesForm';
import { SERIES_LIST_KEY } from './useSeriesList';

/** 建立新系列表單 */
export function SeriesCreateForm({ titleId }: { titleId: string }) {
  const [form, setForm] = useState<SeriesFormState>(initialSeriesForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const noteId = useId();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: postSeries,
    onSuccess: async () => {
      setForm(initialSeriesForm());
      setFieldErrors({});
      await queryClient.invalidateQueries({ queryKey: SERIES_LIST_KEY });
    },
    onError: (error) => {
      setFieldErrors(error instanceof ApiRequestError ? error.fieldErrors : {});
    },
  });

  const update = (patch: Partial<SeriesFormState>) => setForm((current) => ({ ...current, ...patch }));
  const pending = pendingItems(form);
  const note = pendingMessage(pending);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending.length > 0 || mutation.isPending) return;
    mutation.mutate(toCreateSeriesInput(form));
  };

  // 欄位層級以外的錯誤（例如連不上後端）
  const formError =
    mutation.isError && Object.keys(fieldErrors).length === 0 ? mutation.error.message : undefined;

  return (
    <form className={styles.form} aria-labelledby={titleId} onSubmit={submit} noValidate>
      <div className={styles.body}>
        <p className={styles.intro}>這些設定會套用到系列裡的每一支影片。</p>

        <SeriesFields form={form} update={update} fieldErrors={fieldErrors} />

        <p className={styles.note}>這個系列第一支影片送出的問卷答案，會存成系列的問卷預設值，之後的影片自動帶入。</p>

        {formError && (
          <p className={styles.alert} role="alert">
            {formError}
          </p>
        )}
      </div>

      <div className={styles.bar}>
        <BottomActionBar note={note || undefined} noteId={noteId}>
          <Button
            type="submit"
            variant="primary"
            disabled={pending.length > 0 || mutation.isPending}
            aria-describedby={note ? noteId : undefined}
            aria-busy={mutation.isPending || undefined}
          >
            建立系列
          </Button>
        </BottomActionBar>
      </div>
    </form>
  );
}
