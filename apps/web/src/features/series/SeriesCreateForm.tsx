import {
  IMAGE_MODELS,
  SERIES_DIRECTIONS,
  SERIES_DURATIONS,
  VIDEO_MODELS,
  type ImageModelKey,
  type VideoModelKey,
} from '@templeyard/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { ApiRequestError, postSeries } from '../../api/client';
import { AIAssistButton } from '../../components/AIAssistButton';
import { BottomActionBar } from '../../components/BottomActionBar';
import { Button } from '../../components/Button';
import { OptionGroup } from '../../components/OptionGroup';
import { TextField } from '../../components/TextField';
import styles from './SeriesCreateForm.module.css';
import { initialSeriesForm, pendingItems, pendingMessage, toCreateSeriesInput, type SeriesFormState } from './seriesForm';
import { SERIES_LIST_KEY } from './useSeriesList';

const AI_NOT_READY = 'AI 輔助撰寫將在之後的版本開放';

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

        <TextField
          label="系列名稱"
          value={form.name}
          maxLength={40}
          onChange={(name) => update({ name })}
          error={fieldErrors.name}
        />

        <TextField
          label="整體視覺風格"
          multiline
          value={form.visualStyle}
          maxLength={500}
          placeholder="例如：寫實電影感、清晨暖光、淺景深"
          onChange={(visualStyle) => update({ visualStyle })}
          error={fieldErrors.visualStyle}
          labelAccessory={<AIAssistButton field="整體視覺風格" disabledReason={AI_NOT_READY} />}
        />

        <OptionGroup
          legend="影片秒數"
          options={SERIES_DURATIONS.map((value) => ({ value, label: `${value} 秒` }))}
          value={form.durationSec}
          onChange={(durationSec) => update({ durationSec })}
        />

        <OptionGroup
          legend="影片方向"
          options={SERIES_DIRECTIONS.map((value) => ({ value, label: value }))}
          value={form.directionOption}
          // 選了選項就清掉自己寫的內容；自己寫時取消選項
          onChange={(directionOption) => update({ directionOption, directionOther: '' })}
          other={{
            value: form.directionOther,
            onChange: (directionOther) =>
              update({ directionOther, directionOption: directionOther.trim() ? null : form.directionOption }),
          }}
        />
        {fieldErrors.direction && <p className={styles.alert}>{fieldErrors.direction}</p>}

        <OptionGroup<ImageModelKey>
          legend="預設圖片模型"
          options={IMAGE_MODELS.map((m) => ({ value: m.key, label: m.label }))}
          value={form.defaultImageModel}
          onChange={(defaultImageModel) => update({ defaultImageModel })}
        />

        <OptionGroup<VideoModelKey>
          legend="預設影片模型"
          options={VIDEO_MODELS.map((m) => ({ value: m.key, label: m.label }))}
          value={form.defaultVideoModel}
          onChange={(defaultVideoModel) => update({ defaultVideoModel })}
        />

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
