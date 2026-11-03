import { useMutation, useQuery } from '@tanstack/react-query';
import { imageModelLabel, planBoardViews, viewName, type StandardViewKey, type VideoDetail } from '@templeyard/shared';
import { useId, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ApiRequestError, generateTempleBoard, postCostEstimate, regenerateTempleView, reuseTempleBoard } from '../api/client';
import { BottomActionBar } from '../components/BottomActionBar';
import { Button } from '../components/Button';
import { useCostConsent } from '../features/costs/useCostConsent';
import { PhotoSection } from '../features/photos/PhotoSection';
import { useSeriesList } from '../features/series/useSeriesList';
import { ModelSection } from '../features/videos/ModelSection';
import { StepBar } from '../features/videos/StepBar';
import { TempleSection } from '../features/videos/TempleSection';
import { boardEstimateText, bottomNote, currentStep, pendingItems } from '../features/videos/createVideoSteps';
import { useVideoDetail } from '../features/videos/useVideoDetail';
import styles from './CreateVideoPage.module.css';

// 建立影片（/series/:sid/videos/new）：選寺廟 → 選模型 → 上傳照片 → 產生（或沿用）寺廟定裝版
// 選定寺廟後建立影片草稿，編號放在網址的 ?video=，重新整理後仍在。
// 從定裝版頁「補傳照片取代」回來時，網址帶 ?view=，補傳後只重做那個視角。
export function CreateVideoPage() {
  const noteId = useId();
  const navigate = useNavigate();
  const { sid = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const videoId = searchParams.get('video');
  const replaceView = searchParams.get('view');
  const seriesList = useSeriesList();
  const series = seriesList.data?.find((item) => item.id === sid);
  const detailQuery = useVideoDetail(videoId);
  const detail = detailQuery.data ?? null;
  const [inferred, setInferred] = useState<ReadonlySet<StandardViewKey>>(new Set());

  const hasBoard = detail?.video.templeBoardVersionId != null;
  const planned = detail ? planBoardViews(detail.photos, [...inferred]) : [];
  const progress = { hasVideo: detail !== null, photoCount: detail?.photos.length ?? 0, plannedViewCount: planned.length };
  const ready = pendingItems(progress).length === 0;
  const imageModel = detail?.video.imageModel ?? '';
  const items = [{ model: imageModel, units: planned.length }];

  // 「產生寺廟定裝版」旁的費用預估
  const estimate = useQuery({
    queryKey: ['board-estimate', videoId, imageModel, planned.length],
    queryFn: () => postCostEstimate(videoId ?? '', items),
    enabled: Boolean(videoId) && ready && !hasBoard,
  });
  const estimateText = boardEstimateText(planned.length, imageModelLabel(imageModel), estimate.data?.estimate ?? null);
  const consent = useCostConsent(videoId ?? '');

  function toggleInferred(key: StandardViewKey) {
    setInferred((old) => {
      const next = new Set(old);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function generate() {
    if (!videoId) return;
    void consent.ask({
      items,
      confirmLabel: '同意並產生',
      run: async (consentToken) => {
        await generateTempleBoard(videoId, { inferredViewKeys: [...inferred], ...(consentToken ? { consentToken } : {}) });
        navigate(`/videos/${videoId}/temple-board`);
      },
    });
  }

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

        {detail && replaceView && hasBoard && <ReplaceViewSection detail={detail} viewKey={replaceView} />}

        {(!videoId || detail) && (
          <TempleSection
            seriesId={sid}
            detail={detail}
            onVideoCreated={(id) => setSearchParams({ video: id }, { replace: true })}
          />
        )}
        {detail && !hasBoard && detail.reusableBoard && <ReuseSection detail={detail} />}
        {detail && <ModelSection detail={detail} series={series} />}
        {detail && <PhotoSection detail={detail} inferred={inferred} onToggleInferred={toggleInferred} inferLocked={hasBoard} />}
        {consent.error && (
          <p className={styles.error} role="alert">
            產生寺廟定裝版失敗：{consent.error}
          </p>
        )}
      </main>

      {hasBoard && videoId ? (
        <BottomActionBar note="已產生寺廟定裝版" noteId={noteId}>
          <Link className={styles.primaryLink} to={`/videos/${videoId}/temple-board`}>
            前往寺廟定裝版
          </Link>
        </BottomActionBar>
      ) : (
        <BottomActionBar note={bottomNote(progress, estimateText)} noteId={noteId}>
          <Button variant="primary" disabled={!ready || consent.busy} aria-describedby={noteId} onClick={generate}>
            產生寺廟定裝版
          </Button>
        </BottomActionBar>
      )}
      {consent.dialog}
    </div>
  );
}

/** 同系列同一間廟已有確認過的定裝版：直接沿用，不必重新上傳照片 */
function ReuseSection({ detail }: { detail: VideoDetail }) {
  const titleId = useId();
  const navigate = useNavigate();
  const reusable = detail.reusableBoard;
  const reuse = useMutation({
    mutationFn: () => reuseTempleBoard(detail.video.id),
    onSuccess: () => navigate(`/videos/${detail.video.id}/temple-board`),
  });
  if (!reusable) return null;
  const otherModel = reusable.imageModel !== detail.video.imageModel;
  return (
    <section className={styles.notice} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.noticeTitle}>
        沿用寺廟定裝版
      </h2>
      <p>
        這間廟在這個系列已有確認過的寺廟定裝版（第 {reusable.version} 版，{imageModelLabel(reusable.imageModel)}），可以直接沿用，不必重新上傳照片
      </p>
      {otherModel && <p className={styles.muted}>這份定裝版由其他圖片模型產生；也可以上傳照片，用這支影片的模型重新產生。</p>}
      <Button variant="primary" disabled={reuse.isPending} onClick={() => reuse.mutate()}>
        沿用定裝版
      </Button>
      {reuse.isError && (
        <p className={styles.error} role="alert">
          沿用失敗：{reuse.error instanceof ApiRequestError ? reuse.error.message : '請再試一次'}
        </p>
      )}
    </section>
  );
}

/** 從定裝版頁「補傳照片取代」：補傳這個視角的照片後，用照片重新產生它 */
function ReplaceViewSection({ detail, viewKey }: { detail: VideoDetail; viewKey: string }) {
  const titleId = useId();
  const navigate = useNavigate();
  const consent = useCostConsent(detail.video.id);
  const name = viewName(viewKey);
  const hasPhoto = detail.photos.some((photo) => photo.viewKey === viewKey);

  function regenerate() {
    void consent.ask({
      items: [{ model: detail.video.imageModel, units: 1 }],
      confirmLabel: '同意並重生',
      run: async (consentToken) => {
        await regenerateTempleView(detail.video.id, viewKey, consentToken ? { consentToken } : {});
        navigate(`/videos/${detail.video.id}/temple-board`);
      },
    });
  }

  return (
    <section className={styles.notice} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.noticeTitle}>
        補傳照片取代「{name}」
      </h2>
      <p>補傳「{name}」的照片後，用照片重新產生這個視角</p>
      <Button variant="primary" disabled={!hasPhoto || consent.busy} onClick={regenerate}>
        用照片重新產生：{name}
      </Button>
      {!hasPhoto && <p className={styles.muted}>在下方「視角對照」按「補傳：{name}」上傳照片。</p>}
      {consent.error && (
        <p className={styles.error} role="alert">
          重新產生失敗：{consent.error}
        </p>
      )}
      {consent.dialog}
    </section>
  );
}
