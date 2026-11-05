import { useMutation, useQuery } from '@tanstack/react-query';
import {
  VIDEO_FILTER_LABELS,
  VIDEO_SORTS,
  VIDEO_SORT_LABELS,
  filterVideos,
  formatDuration,
  imageModelLabel,
  sortVideos,
  videoCounts,
  videoEntryPath,
  videoModelLabel,
  type SeriesVideo,
  type VideoFilter,
  type VideoSort,
} from '@templeyard/shared';
import { Copy, Download, Film, Lock, Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { assetUrl, copyVideo, fetchSeriesVideos, finalDownloadUrl } from '../../api/client';
import { Button } from '../../components/Button';
import { Tag } from '../../components/Tag';
import { seriesVideosKey } from '../../features/series/SeriesCard';
import { FilterButtons } from '../../features/series/FilterButtons';
import { useSeriesPage } from './SeriesShell';
import styles from './SeriesPages.module.css';

// 過去的影片分頁（docs/03-App-Flow.md「過去的影片分頁」、設計稿 Videos）

/** 「2026-11-04 21:10」 */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'short', hour12: false }).format(date);
  return parts.replace(',', '');
}

function VideoCard({ video, onCopy, copying }: { video: SeriesVideo; onCopy: () => void; copying: boolean }) {
  const titleId = useId();
  const done = video.group === 'done';
  const hasFinal = video.stage === 'final' || video.stage === 'done';
  const openLabel = hasFinal ? '開啟成品' : '繼續製作';
  const time = formatDateTime(video.updatedAt);
  return (
    <li>
      <article className={styles.card} aria-labelledby={titleId}>
        <div className={styles.thumb} style={{ aspectRatio: '16 / 9' }}>
          {video.thumbnailAssetId ? (
            <img src={assetUrl(video.thumbnailAssetId)} alt={`${video.title} 縮圖`} />
          ) : (
            <div role="img" aria-label={`${video.title} 縮圖`}>
              <Film size={40} strokeWidth={1.5} aria-hidden="true" />
            </div>
          )}
          {video.finalDurationSec !== null && <span className={styles.duration}>{formatDuration(video.finalDurationSec)}</span>}
        </div>
        <div className={styles.cardBody}>
          <div className={styles.cardHead}>
            <Tag tone={done ? 'success' : video.statusLabel.includes('需重新確認') || video.stage === 'board_pending' || video.stage === 'final' ? 'warning' : 'info'}>{video.statusLabel}</Tag>
            {video.isDefaultsSource && <Tag>問卷預設來源</Tag>}
          </div>
          <h2 id={titleId} className={styles.cardTitle}>
            {video.title}
          </h2>
          <p className={styles.text}>{`${video.templeName}・${video.district}`}</p>
          <p className={styles.modelLine}>
            <Lock size={14} strokeWidth={2} role="img" aria-label="模型已鎖定" />
            {`${imageModelLabel(video.imageModel)}・${videoModelLabel(video.videoModel)}`}
          </p>
          <p className={styles.meta}>{`${done ? '完成於' : '更新於'} ${time}`}</p>
          <div className={styles.cardActions}>
            <Link className={styles.outlineLink} to={videoEntryPath(video)} aria-label={`${openLabel}：${video.title}`}>
              {openLabel}
            </Link>
            <Button onClick={onCopy} disabled={copying} aria-label={`複製這支影片：${video.title}`}>
              <Copy size={16} strokeWidth={1.8} aria-hidden="true" /> 複製這支影片
            </Button>
            {done && (
              <a className={styles.secondaryLink} href={finalDownloadUrl(video.id)} download aria-label={`下載〈${video.title}〉`}>
                <Download size={18} strokeWidth={1.8} aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      </article>
    </li>
  );
}

export function SeriesVideosTab() {
  const { series } = useSeriesPage();
  const navigate = useNavigate();
  const sortId = useId();
  const [filter, setFilter] = useState<VideoFilter>('all');
  const [sort, setSort] = useState<VideoSort>('updated');
  const videos = useQuery({ queryKey: seriesVideosKey(series.id), queryFn: () => fetchSeriesVideos(series.id) });
  const copy = useMutation({
    mutationFn: copyVideo,
    onSuccess: (copied) => navigate(`/series/${copied.seriesId}/videos/new?video=${copied.id}`),
  });
  const all = videos.data?.videos ?? [];
  const counts = videoCounts(all);
  const shown = sortVideos(filterVideos(all, filter), sort);

  return (
    <>
      <div className={styles.toolbar}>
        <FilterButtons
          label="依狀態篩選"
          value={filter}
          onChange={setFilter}
          options={(['all', 'wip', 'done'] as const).map((value) => ({ value, label: VIDEO_FILTER_LABELS[value], count: counts[value] }))}
        />
        <div className={styles.selectRow}>
          <label htmlFor={sortId}>排序</label>
          <select id={sortId} value={sort} onChange={(event) => setSort(event.target.value as VideoSort)}>
            {VIDEO_SORTS.map((value) => (
              <option key={value} value={value}>
                {VIDEO_SORT_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.spacer} />
        <Link className={styles.primaryLink} to={`/series/${series.id}/videos/new`}>
          <Plus size={18} strokeWidth={2} aria-hidden="true" />
          新增影片
        </Link>
      </div>

      {videos.isPending && (
        <p className={styles.hint} role="status">
          正在讀取影片…
        </p>
      )}
      {videos.isError && (
        <p className={styles.error} role="alert">
          讀不到影片：{videos.error.message}
        </p>
      )}
      {copy.isError && (
        <p className={styles.error} role="alert">
          複製失敗：{copy.error.message}
        </p>
      )}
      {videos.isSuccess && all.length === 0 && <p className={styles.emptyBox}>這個系列還沒有影片。</p>}
      {videos.isSuccess && all.length > 0 && shown.length === 0 && <p className={styles.emptyBox}>這個篩選條件下沒有影片。</p>}
      {shown.length > 0 && (
        <ul className={styles.grid} aria-label="影片列表">
          {shown.map((video) => (
            <VideoCard key={video.id} video={video} copying={copy.isPending} onCopy={() => copy.mutate(video.id)} />
          ))}
        </ul>
      )}
      <p className={styles.hint}>「複製這支影片」會帶入寺廟、問卷答案與分鏡方案（不含已生成的圖片與影片），再到建立影片頁選擇模型。</p>
    </>
  );
}
