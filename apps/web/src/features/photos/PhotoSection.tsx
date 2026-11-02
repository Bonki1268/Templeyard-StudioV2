import { useMutation } from '@tanstack/react-query';
import {
  MAX_TEMPLE_PHOTOS,
  STANDARD_VIEWS,
  viewCoverage,
  viewKeySchema,
  type Photo,
  type StandardViewKey,
  type VideoDetail,
} from '@templeyard/shared';
import { Upload } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { ApiRequestError, assetUrl, patchPhoto } from '../../api/client';
import { Button } from '../../components/Button';
import { Tag } from '../../components/Tag';
import { activeBoxes } from '../deid/boxes';
import { useUpdateVideoDetail } from '../videos/useVideoDetail';
import { MaskEditor } from './MaskEditor';
import styles from './PhotoSection.module.css';
import { PhotoProcessError, processAndUploadPhoto } from './processPhoto';
import { photoCountText, planUploads, skippedMessage } from './uploadPlan';

const ACCEPT = 'image/jpeg,image/png,image/webp';

/** 3 上傳寺廟照片：在瀏覽器去識別後才上傳；可調整遮蔽、指定視角 */
export function PhotoSection({ detail }: { detail: VideoDetail }) {
  const titleId = useId();
  const videoId = detail.video.id;
  const { photos } = detail;
  const updateDetail = useUpdateVideoDetail(videoId);
  const inputRef = useRef<HTMLInputElement>(null);
  // 從視角對照「補傳」時，這次上傳的照片直接對應那個視角
  const pendingViewRef = useRef<StandardViewKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const full = photos.length >= MAX_TEMPLE_PHOTOS;
  const editingIndex = photos.findIndex((photo) => photo.id === editingId);
  const editing = editingIndex >= 0 ? photos[editingIndex] : undefined;

  function replacePhoto(updated: Photo) {
    updateDetail((old) => ({ ...old, photos: old.photos.map((photo) => (photo.id === updated.id ? updated : photo)) }));
  }

  async function upload(files: File[], viewKey: StandardViewKey | null) {
    setError(null);
    setNotice(null);
    const { accepted, skipped } = planUploads(photos.length, files);
    if (skipped > 0) setNotice(skippedMessage(skipped));
    if (accepted.length === 0) return;
    setBusy(true);
    try {
      for (const file of accepted) {
        const photo = await processAndUploadPhoto(videoId, file, viewKey);
        updateDetail((old) => ({ ...old, photos: [...old.photos, photo] }));
      }
    } catch (cause: unknown) {
      setError(
        cause instanceof PhotoProcessError || cause instanceof ApiRequestError
          ? cause.message
          : '照片上傳失敗，請再試一次。',
      );
    } finally {
      setBusy(false);
    }
  }

  function chooseFor(viewKey: StandardViewKey) {
    pendingViewRef.current = viewKey;
    inputRef.current?.click();
  }

  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <div className={styles.head}>
        <h2 id={titleId} className={styles.title}>
          <span className={styles.number} aria-hidden="true">
            3
          </span>
          上傳寺廟照片
        </h2>
        <p className={styles.count}>{photoCountText(photos.length)}</p>
      </div>
      <p className={styles.intro}>
        上傳 1～{MAX_TEMPLE_PHOTOS} 張這間廟的照片，盡量涵蓋不同位置。照片裡的臉孔會在你的電腦上自動遮蔽，原圖只存在這台電腦；車牌請在「調整遮蔽」裡自己加上。
      </p>

      {photos.length > 0 && (
        <ul className={styles.grid}>
          {photos.map((photo, index) => (
            <li key={photo.id}>
              <PhotoCard
                videoId={videoId}
                photo={photo}
                name={`照片 ${index + 1}`}
                onChanged={replacePhoto}
                onEdit={() => setEditingId(photo.id)}
              />
            </li>
          ))}
        </ul>
      )}

      <div className={styles.uploadRow}>
        <label className={styles.upload} data-disabled={busy || full ? 'true' : undefined}>
          <input
            ref={inputRef}
            className={styles.visuallyHidden}
            type="file"
            accept={ACCEPT}
            multiple
            disabled={busy || full}
            onClick={(event) => {
              // 直接按「上傳照片」時不指定視角；補傳是用程式觸發，不會經過這裡的使用者點擊
              if (event.isTrusted) pendingViewRef.current = null;
            }}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              const viewKey = pendingViewRef.current;
              pendingViewRef.current = null;
              event.target.value = '';
              if (files.length > 0) void upload(files, viewKey);
            }}
          />
          <Upload size={18} strokeWidth={1.8} aria-hidden="true" />
          上傳照片
        </label>
        {full && <p className={styles.muted}>已達 {MAX_TEMPLE_PHOTOS} 張上限</p>}
      </div>

      <p className={styles.muted} role="status">
        {busy ? '正在去識別照片…' : (notice ?? '')}
      </p>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <ViewCoverageList photos={photos} canUpload={!busy && !full} onUploadFor={chooseFor} />

      {editing && (
        <MaskEditor
          videoId={videoId}
          photo={editing}
          name={`照片 ${editingIndex + 1}`}
          onClose={() => setEditingId(null)}
          onSaved={(updated) => {
            replacePhoto(updated);
            setEditingId(null);
          }}
        />
      )}
    </section>
  );
}

function PhotoCard({
  videoId,
  photo,
  name,
  onChanged,
  onEdit,
}: {
  videoId: string;
  photo: Photo;
  name: string;
  onChanged: (photo: Photo) => void;
  onEdit: () => void;
}) {
  const selectId = useId();
  const setView = useMutation({
    mutationFn: (viewKey: StandardViewKey | null) => patchPhoto(videoId, photo.id, { viewKey }),
    onSuccess: onChanged,
  });
  const masked = activeBoxes(photo.deidBoxes).length;

  return (
    <article className={styles.card} aria-label={name}>
      <img className={styles.thumb} src={assetUrl(photo.deidentifiedAssetId)} alt={`${name}（已去識別）`} />
      <div className={styles.cardBody}>
        <div className={styles.cardTags}>
          <Tag tone="success">已去識別</Tag>
          <span className={styles.muted}>遮蔽 {masked} 處</span>
        </div>
        <label className={styles.viewLabel} htmlFor={selectId}>
          拍到的視角
        </label>
        <select
          id={selectId}
          className={styles.select}
          value={photo.viewKey ?? ''}
          disabled={setView.isPending}
          onChange={(event) => {
            const parsed = viewKeySchema.safeParse(event.target.value);
            setView.mutate(parsed.success ? parsed.data : null);
          }}
        >
          <option value="">未指定</option>
          {STANDARD_VIEWS.map((view) => (
            <option key={view.key} value={view.key}>
              {view.name}
            </option>
          ))}
        </select>
        {setView.isError && (
          <p className={styles.error} role="alert">
            指定視角失敗：{setView.error.message}
          </p>
        )}
        <Button onClick={onEdit}>調整遮蔽</Button>
      </div>
    </article>
  );
}

/** 視角對照：每個標準視角「已有照片」或「缺少照片」；缺少的可以補傳 */
function ViewCoverageList({
  photos,
  canUpload,
  onUploadFor,
}: {
  photos: readonly Photo[];
  canUpload: boolean;
  onUploadFor: (viewKey: StandardViewKey) => void;
}) {
  const titleId = useId();
  return (
    <section className={styles.coverage} aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.subtitle}>
        視角對照
      </h3>
      <p className={styles.muted}>在每張照片的「拍到的視角」指定位置；缺少照片的視角可以補傳。</p>
      <ul className={styles.coverageList}>
        {viewCoverage(photos).map((row) => (
          <li key={row.key} className={styles.coverageRow}>
            <span>{row.name}</span>
            {row.status === 'has_photo' ? <Tag tone="success">已有照片</Tag> : <Tag tone="warning">缺少照片</Tag>}
            {row.status === 'missing' && (
              <Button className={styles.coverageAction} aria-label={`補傳：${row.name}`} disabled={!canUpload} onClick={() => onUploadFor(row.key)}>
                補傳
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
