import { useId } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { BottomActionBar } from '../components/BottomActionBar';
import { Button } from '../components/Button';
import { PhotoSection } from '../features/photos/PhotoSection';
import { useSeriesList } from '../features/series/useSeriesList';
import { ModelSection } from '../features/videos/ModelSection';
import { StepBar } from '../features/videos/StepBar';
import { TempleSection } from '../features/videos/TempleSection';
import { bottomNote, currentStep } from '../features/videos/createVideoSteps';
import { useVideoDetail } from '../features/videos/useVideoDetail';
import styles from './CreateVideoPage.module.css';

// 建立影片（/series/:sid/videos/new）：選寺廟 → 選模型 → 上傳照片 → 寺廟定裝版（第 5 階段）
// 選定寺廟後建立影片草稿，編號放在網址的 ?video=，重新整理後仍在。
export function CreateVideoPage() {
  const noteId = useId();
  const { sid = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const videoId = searchParams.get('video');
  const seriesList = useSeriesList();
  const series = seriesList.data?.find((item) => item.id === sid);
  const detailQuery = useVideoDetail(videoId);
  const detail = detailQuery.data ?? null;
  const progress = { hasVideo: detail !== null, photoCount: detail?.photos.length ?? 0 };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            廟
          </span>
          廟埕影室
        </Link>
        <nav aria-label="目前位置">
          <ol className={styles.breadcrumb}>
            <li>
              <Link to="/">{series?.name ?? '系列'}</Link>
            </li>
            <li aria-current="page">建立影片</li>
          </ol>
        </nav>
      </header>

      <main className={styles.main}>
        <h1 className={styles.title}>建立影片</h1>
        <p className={styles.intro}>選定寺廟與模型，上傳照片後產生寺廟定裝版。定裝版確認後就能開始創作。</p>
        <StepBar current={currentStep(progress)} />

        {seriesList.isSuccess && !series && (
          <p className={styles.error} role="alert">
            找不到這個系列。<Link to="/">回到系列首頁</Link>
          </p>
        )}
        {detailQuery.isPending && videoId && <p className={styles.muted}>正在讀取影片…</p>}
        {detailQuery.isError && (
          <p className={styles.error} role="alert">
            讀不到這支影片：{detailQuery.error.message}
          </p>
        )}

        {(!videoId || detail) && (
          <TempleSection
            seriesId={sid}
            detail={detail}
            onVideoCreated={(id) => setSearchParams({ video: id }, { replace: true })}
          />
        )}
        {detail && <ModelSection detail={detail} series={series} />}
        {detail && <PhotoSection detail={detail} />}
      </main>

      <BottomActionBar note={bottomNote(progress)} noteId={noteId}>
        <Button variant="primary" disabled aria-describedby={noteId}>
          產生寺廟定裝版
        </Button>
      </BottomActionBar>
    </div>
  );
}
