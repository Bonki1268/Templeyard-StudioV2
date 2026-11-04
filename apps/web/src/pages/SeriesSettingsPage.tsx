import { useQuery } from '@tanstack/react-query';
import { QUESTIONNAIRE_QUESTIONS, imageModelLabel, videoEntryPath, videoModelLabel, videoStageLabel } from '@templeyard/shared';
import { Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { Link, useParams } from 'react-router';
import { assetUrl, fetchSeriesVideos } from '../api/client';
import { seriesVideosKey } from '../features/series/SeriesCard';
import { SeriesCharacterLibrary } from '../features/series/SeriesCharacterLibrary';
import { SeriesEditForm } from '../features/series/SeriesEditForm';
import { Button } from '../components/Button';
import { useSeriesList } from '../features/series/useSeriesList';
import page from './CreateVideoPage.module.css';
import styles from './SeriesSettingsPage.module.css';

// 系列設定（/series/:sid/settings，03 路由表）：系列的設定與問卷預設值，以及這個系列過去做的影片（使用者 2026-11-04 提出）；
// 可以修改系列設定，並有角色庫（使用者 2026-11-05 提出）

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short', hour12: false });
}

export function SeriesSettingsPage() {
  const { sid = '' } = useParams();
  const settingsId = useId();
  const videosId = useId();
  const [editing, setEditing] = useState(false);
  const seriesList = useSeriesList();
  const series = seriesList.data?.find((item) => item.id === sid);
  const videos = useQuery({ queryKey: seriesVideosKey(sid), queryFn: () => fetchSeriesVideos(sid), enabled: Boolean(sid) });
  const defaults = series?.questionnaireDefaults ?? null;
  const defaultLines = defaults
    ? QUESTIONNAIRE_QUESTIONS.flatMap((q) => {
        const value = defaults[q.id];
        if (value === undefined || value === null || value === '') return [];
        const text = typeof value === 'string' ? value : typeof value === 'object' ? Object.values(value as Record<string, unknown>).filter(Boolean).join('；') : String(value);
        return text ? [`${q.title}：${text}`] : [];
      })
    : [];

  return (
    <div className={page.page}>
      <header className={page.header}>
        <Link to="/" className={page.brand}>
          <span className={page.mark} aria-hidden="true">
            廟
          </span>
          廟埕影室
        </Link>
        <nav aria-label="目前位置">
          <ol className={page.breadcrumb}>
            <li>
              <Link to="/">{series?.name ?? '系列'}</Link>
            </li>
            <li aria-current="page">系列設定</li>
          </ol>
        </nav>
      </header>

      <main className={page.main}>
        <h1 className={page.title}>系列設定</h1>
        {seriesList.isSuccess && !series && (
          <p className={page.error} role="alert">
            找不到這個系列。<Link to="/">回到系列首頁</Link>
          </p>
        )}

        {series && (
          <section className={styles.section} aria-labelledby={settingsId}>
            <div className={styles.sectionHead}>
              <h2 id={settingsId} className={styles.sectionTitle}>
                {series.name}
              </h2>
              {!editing && <Button onClick={() => setEditing(true)}>修改系列設定</Button>}
            </div>
            {editing ? (
              <SeriesEditForm series={series} titleId={settingsId} onDone={() => setEditing(false)} />
            ) : (
              <dl className={styles.facts}>
                <div>
                  <dt>影片方向</dt>
                  <dd>{series.direction}</dd>
                </div>
                <div>
                  <dt>整體視覺風格</dt>
                  <dd>{series.visualStyle || '沒有'}</dd>
                </div>
                <div>
                  <dt>預設模型</dt>
                  <dd>{`${imageModelLabel(series.defaultImageModel)} · ${videoModelLabel(series.defaultVideoModel)}`}</dd>
                </div>
                <div>
                  <dt>問卷預設值</dt>
                  <dd>{defaultLines.length > 0 ? defaultLines.join('\n') : '第一支影片送出問卷後會存成預設值'}</dd>
                </div>
              </dl>
            )}
          </section>
        )}

        {series && <SeriesCharacterLibrary seriesId={series.id} />}

        <section className={styles.section} aria-labelledby={videosId}>
          <div className={styles.sectionHead}>
            <h2 id={videosId} className={styles.sectionTitle}>
              這個系列的影片
            </h2>
            {series && (
              <Link className={page.primaryLink} to={`/series/${series.id}/videos/new`}>
                <Plus size={18} strokeWidth={1.8} aria-hidden="true" />
                新增影片
              </Link>
            )}
          </div>
          {videos.isPending && (
            <p className={styles.muted} role="status">
              正在讀取影片…
            </p>
          )}
          {videos.isError && (
            <p className={page.error} role="alert">
              讀不到影片：{videos.error.message}
            </p>
          )}
          {videos.isSuccess && videos.data.videos.length === 0 && <p className={styles.muted}>還沒有影片。</p>}
          {videos.isSuccess && videos.data.videos.length > 0 && (
            <ul className={styles.videos} aria-label="這個系列的影片">
              {videos.data.videos.map((video) => {
                const name = `${video.templeName}・${videoStageLabel(video.stage)}`;
                return (
                  <li key={video.id} className={styles.video}>
                    {video.thumbnailAssetId ? (
                      <img className={styles.thumb} src={assetUrl(video.thumbnailAssetId)} alt={`${video.templeName}第 1 格精緻圖`} />
                    ) : (
                      <div className={styles.thumb} aria-hidden="true" />
                    )}
                    <div className={styles.videoText}>
                      <Link to={videoEntryPath(video)} className={styles.videoLink}>
                        {name}
                      </Link>
                      <span className={styles.muted}>{`更新於 ${formatTime(video.updatedAt)}`}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
