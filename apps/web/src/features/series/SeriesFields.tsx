import {
  IMAGE_MODELS,
  SERIES_DIRECTIONS,
  VIDEO_MODELS,
  type ImageModelKey,
  type VideoModelKey,
} from '@templeyard/shared';
import { OptionGroup } from '../../components/OptionGroup';
import { TextField } from '../../components/TextField';
import { useAiAssist } from '../assist/useAiAssist';
import styles from './SeriesCreateForm.module.css';
import type { SeriesFormState } from './seriesForm';

type SeriesFieldsProps = {
  form: SeriesFormState;
  update: (patch: Partial<SeriesFormState>) => void;
  fieldErrors: Record<string, string>;
  /** 修改既有系列時，AI 幫我寫可以參考這個系列 */
  seriesId?: string;
};

/** 系列的設定欄位：建立系列與修改系列設定共用（不含秒數，使用者 2026-11-05 提出） */
export function SeriesFields({ form, update, fieldErrors, seriesId }: SeriesFieldsProps) {
  const styleAssist = useAiAssist({
    field: 'series.visualStyle',
    fieldLabel: '整體視覺風格',
    seriesId,
    userInput: () => form.visualStyle,
    onAdopt: (visualStyle) => update({ visualStyle }),
  });

  return (
    <>
      <TextField label="系列名稱" value={form.name} maxLength={40} onChange={(name) => update({ name })} error={fieldErrors.name} />

      <TextField
        label="整體視覺風格"
        multiline
        value={form.visualStyle}
        maxLength={500}
        placeholder="例如：寫實電影感、清晨暖光、淺景深"
        onChange={(visualStyle) => update({ visualStyle })}
        error={fieldErrors.visualStyle}
        labelAccessory={styleAssist.button}
      />
      {styleAssist.panel}

      <OptionGroup
        legend="影片方向"
        options={SERIES_DIRECTIONS.map((value) => ({ value, label: value }))}
        value={form.directionOption}
        // 選了選項就清掉自己寫的內容；自己寫時取消選項
        onChange={(directionOption) => update({ directionOption, directionOther: '' })}
        other={{
          value: form.directionOther,
          onChange: (directionOther) => update({ directionOther, directionOption: directionOther.trim() ? null : form.directionOption }),
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
    </>
  );
}
