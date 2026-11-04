import { seriesCardTags, type Series } from '@templeyard/shared';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router';
import { fetchSeriesVideos } from '../../api/client';
import { Tag } from '../../components/Tag';
import styles from './SeriesCard.module.css';

export function seriesVideosKey(seriesId: string) {
  return ['series-videos', seriesId] as const;
}

/**
 * 系列卡片（依「1 系列首頁」設計圖）：名稱與標籤（影片方向、用過的寺廟最多 3 個＋「+N」、共同角色）；
 * 不顯示整段視覺風格（使用者 2026-11-05 提出）。
 * 有影片時是「新增影片」與「系列設定」，還沒有影片時是「新增第一支影片」
 */
export function SeriesCard({ series }: { series: Series }) {
  const titleId = useId();
  const videos = useQuery({ queryKey: seriesVideosKey(series.id), queryFn: () => fetchSeriesVideos(series.id) });
  const list = videos.data?.videos ?? [];
  const tags = seriesCardTags({ direction: series.direction, videos: list, characters: videos.data?.characters ?? [] });
  const newVideo = `/series/${series.id}/videos/new`;

  return (
    <article className={styles.card} aria-labelledby={titleId}>
      <div className={styles.head}>
        <h3 id={titleId} className={styles.name}>
          {series.name}
        </h3>
      </div>
      {tags.length > 0 && (
        <ul className={styles.tags} aria-label={`${series.name}的標籤`}>
          {tags.map((tag) => (
            <li key={tag}>
              <Tag>{tag}</Tag>
            </li>
          ))}
        </ul>
      )}
      {videos.isSuccess && list.length === 0 ? (
        <>
          <p className={styles.empty}>還沒有影片</p>
          <div className={styles.actions}>
            <Link className={styles.secondary} to={newVideo}>
              新增第一支影片
            </Link>
          </div>
        </>
      ) : (
        <div className={styles.actions}>
          <Link className={styles.primary} to={newVideo}>
            <Plus size={18} strokeWidth={1.8} aria-hidden="true" />
            新增影片
          </Link>
          <Link className={styles.secondary} to={`/series/${series.id}/settings`}>
            系列設定
          </Link>
        </div>
      )}
    </article>
  );
}
