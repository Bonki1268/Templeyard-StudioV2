import { useMutation } from '@tanstack/react-query';
import {
  IMAGE_MODELS,
  VIDEO_MODELS,
  referencePriceText,
  type ModelInfo,
  type Series,
  type UpdateVideoInput,
  type VideoDetail,
} from '@templeyard/shared';
import { Lock, TriangleAlert } from 'lucide-react';
import { useId } from 'react';
import { patchVideo } from '../../api/client';
import { Tag } from '../../components/Tag';
import styles from './ModelSection.module.css';
import { useUpdateVideoDetail } from './useVideoDetail';

type ModelSectionProps = { detail: VideoDetail; series: Series | undefined };

/** 2 選擇生成模型：帶入系列預設，可改；產生寺廟定裝版後鎖定（第 5 階段） */
export function ModelSection({ detail, series }: ModelSectionProps) {
  const titleId = useId();
  const { video } = detail;
  const updateDetail = useUpdateVideoDetail(video.id);
  const choose = useMutation({
    mutationFn: (input: UpdateVideoInput) => patchVideo(video.id, input),
    onSuccess: (updated) => updateDetail((old) => ({ ...old, video: updated })),
  });
  const locked = video.modelsLockedAt !== null;
  const noAudio = VIDEO_MODELS.find((model) => model.key === video.videoModel && !model.nativeAudio);

  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <div className={styles.head}>
        <h2 id={titleId} className={styles.title}>
          <span className={styles.number} aria-hidden="true">
            2
          </span>
          選擇生成模型
        </h2>
        <p className={styles.lockNote}>
          <Lock size={16} strokeWidth={1.8} aria-hidden="true" />
          按下「產生寺廟定裝版」後鎖定，這支影片不能再換模型
        </p>
      </div>

      <ModelPicker
        legend="圖片模型"
        models={IMAGE_MODELS}
        value={video.imageModel}
        seriesDefault={series?.defaultImageModel}
        disabled={locked || choose.isPending}
        onChange={(imageModel) => choose.mutate({ imageModel })}
      />
      <ModelPicker
        legend="影片模型"
        models={VIDEO_MODELS}
        value={video.videoModel}
        seriesDefault={series?.defaultVideoModel}
        disabled={locked || choose.isPending}
        onChange={(videoModel) => choose.mutate({ videoModel })}
      />

      {noAudio && (
        <p className={styles.warning}>
          <TriangleAlert size={16} strokeWidth={1.8} aria-hidden="true" />
          <span>{noAudio.label} 沒有原生語音：有台詞的鏡頭需要另外處理對口型</span>
        </p>
      )}
      {choose.isError && (
        <p className={styles.error} role="alert">
          更換模型失敗：{choose.error.message}
        </p>
      )}
    </section>
  );
}

type ModelPickerProps<K extends string> = {
  legend: string;
  models: readonly (ModelInfo & { key: K })[];
  value: string;
  seriesDefault: string | undefined;
  disabled: boolean;
  onChange: (key: K) => void;
};

/** 單選的模型卡片：名稱、系列預設標籤、主要特性與參考單價（以 aria-describedby 關聯） */
function ModelPicker<K extends string>({ legend, models, value, seriesDefault, disabled, onChange }: ModelPickerProps<K>) {
  const baseId = useId();
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>{legend}</legend>
      <ul className={styles.options}>
        {models.map((model) => {
          const descriptionId = `${baseId}-${model.key}`;
          return (
            <li key={model.key}>
              <button
                type="button"
                className={styles.option}
                aria-pressed={model.key === value}
                aria-label={model.label}
                aria-describedby={descriptionId}
                disabled={disabled}
                onClick={() => {
                  if (model.key !== value) onChange(model.key);
                }}
              >
                <span className={styles.optionHead}>
                  <span className={styles.optionName}>{model.label}</span>
                  {model.key === seriesDefault && <Tag>系列預設</Tag>}
                </span>
                <span id={descriptionId} className={styles.optionDescription}>
                  <span>{model.features}</span> <span className={styles.price}>{referencePriceText(model.referencePrice)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
