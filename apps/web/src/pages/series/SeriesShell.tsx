import { useQuery } from '@tanstack/react-query';
import type { Series } from '@templeyard/shared';
import { Link, Outlet, useOutletContext, useParams } from 'react-router';
import { fetchLibraryCharacters, fetchSeriesVideos } from '../../api/client';
import { LeaveGuardProvider, useLeaveGuard } from '../../features/series/LeaveGuard';
import { seriesVideosKey } from '../../features/series/SeriesCard';
import { SeriesTabs } from '../../features/series/SeriesTabs';
import { useSeriesList } from '../../features/series/useSeriesList';
import styles from './SeriesPages.module.css';

// 系列頁的外框（docs/03-App-Flow.md「系列頁」、設計稿 docs/design/series/）：
// 頁首與麵包屑；找不到系列時說明；子頁共用目前的系列

export type SeriesPageContext = { series: Series };

export function useSeriesPage(): SeriesPageContext {
  return useOutletContext<SeriesPageContext>();
}

export const seriesLibraryKey = (seriesId: string) => ['series-library', seriesId] as const;

/** 目前所在的位置（麵包屑）；有未儲存的變更時，點連結先提醒 */
function ShellHeader({ seriesName, seriesId }: { seriesName: string | null; seriesId: string }) {
  const guard = useLeaveGuard();
  return (
    <div className={styles.topBar}>
      <div className={styles.topBarInner}>
        <Link to="/" className={styles.brand} onClick={(event) => guard.intercept(event, '/')}>
          <span className={styles.mark} aria-hidden="true">
            廟
          </span>
          廟埕影室
        </Link>
        <nav aria-label="目前位置">
          <ol className={styles.breadcrumb}>
            <li>
              <Link to="/" onClick={(event) => guard.intercept(event, '/')}>
                我的系列
              </Link>
            </li>
            {seriesName !== null && (
              <li>
                <Link to={`/series/${seriesId}/settings`} onClick={(event) => guard.intercept(event, `/series/${seriesId}/settings`)}>
                  {seriesName}
                </Link>
              </li>
            )}
          </ol>
        </nav>
      </div>
    </div>
  );
}

export function SeriesShell() {
  const { sid = '' } = useParams();
  const list = useSeriesList();
  const series = list.data?.find((item) => item.id === sid);
  return (
    <LeaveGuardProvider>
      <div className={styles.page}>
        <ShellHeader seriesName={series?.name ?? null} seriesId={sid} />
        {list.isPending && (
          <p className={styles.notice} role="status">
            正在讀取系列…
          </p>
        )}
        {list.isError && (
          <p className={styles.errorBox} role="alert">
            讀不到系列：{list.error.message}
          </p>
        )}
        {list.isSuccess && !series && (
          <div className={styles.notFound}>
            <p role="alert" className={styles.errorBox}>
              找不到這個系列
            </p>
            <Link to="/">回到系列首頁</Link>
          </div>
        )}
        {series && <Outlet context={{ series } satisfies SeriesPageContext} />}
      </div>
    </LeaveGuardProvider>
  );
}

/** 三個分頁共用的標題區：系列名稱、數量、分頁 */
export function SeriesTabsLayout() {
  const { series } = useSeriesPage();
  const videos = useQuery({ queryKey: seriesVideosKey(series.id), queryFn: () => fetchSeriesVideos(series.id) });
  const library = useQuery({ queryKey: seriesLibraryKey(series.id), queryFn: () => fetchLibraryCharacters(series.id) });
  const videoCount = videos.data?.videos.length ?? null;
  const characterCount = library.data?.length ?? null;
  const created = series.createdAt.slice(0, 10);
  return (
    <>
      <section className={styles.titleBlock} aria-label="系列">
        <p className={styles.eyebrow}>系列</p>
        <h1 className={styles.title}>{series.name}</h1>
        {videoCount !== null && characterCount !== null && <p className={styles.summary}>{`${videoCount} 支影片・${characterCount} 位角色・建立於 ${created}`}</p>}
        <SeriesTabs seriesId={series.id} characterCount={characterCount} videoCount={videoCount} />
      </section>
      <main className={styles.main}>
        <Outlet context={{ series } satisfies SeriesPageContext} />
      </main>
    </>
  );
}
