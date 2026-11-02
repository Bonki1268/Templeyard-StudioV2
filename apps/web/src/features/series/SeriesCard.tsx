import { imageModelLabel, videoModelLabel, type Series } from '@templeyard/shared';
import { Plus } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router';
import styles from './SeriesCard.module.css';
import { seriesMeta } from './seriesForm';

/** 系列卡片：新增影片是卡片上的主要動作 */
export function SeriesCard({ series }: { series: Series }) {
  const titleId = useId();
  return (
    <article className={styles.card} aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.name}>
        {series.name}
      </h3>
      <p className={styles.meta}>{seriesMeta(series)}</p>
      <p className={styles.style}>{series.visualStyle}</p>
      <p className={styles.models}>
        預設模型：{imageModelLabel(series.defaultImageModel)} · {videoModelLabel(series.defaultVideoModel)}
      </p>
      <div className={styles.actions}>
        <Link className={styles.addVideo} to={`/series/${series.id}/videos/new`}>
          <Plus size={18} strokeWidth={1.8} aria-hidden="true" />
          新增影片
        </Link>
      </div>
    </article>
  );
}
