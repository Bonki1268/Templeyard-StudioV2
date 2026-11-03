import { Link, useParams } from 'react-router';
import { useVideoDetail } from '../features/videos/useVideoDetail';
import page from './CreateVideoPage.module.css';

// 創作工作區（/videos/:vid/studio）：進入條件是寺廟定裝版已確認（03 路由表）。
// 對話與各面板在第 6 階段之後才做，這裡先檢查進入條件。
export function StudioPage() {
  const { vid = '' } = useParams();
  const detail = useVideoDetail(vid);
  const video = detail.data?.video;
  const boardPending = video !== undefined && (video.stage === 'creating' || video.stage === 'board_pending');

  return (
    <div className={page.page}>
      <header className={page.header}>
        <Link to="/" className={page.brand}>
          <span className={page.mark} aria-hidden="true">
            廟
          </span>
          廟埕影室
        </Link>
      </header>
      <main className={page.main}>
        {detail.isError && (
          <p className={page.error} role="alert">
            讀不到這支影片：{detail.error.message}
          </p>
        )}
        {boardPending && (
          <p className={page.error} role="alert">
            寺廟定裝版還沒確認，還不能開始創作。
            {video.templeBoardVersionId ? (
              <Link to={`/videos/${vid}/temple-board`}>回到寺廟定裝版</Link>
            ) : (
              <Link to={`/series/${video.seriesId}/videos/new?video=${vid}`}>回到建立影片</Link>
            )}
          </p>
        )}
        {video && !boardPending && (
          <>
            <h1 className={page.title}>創作工作區</h1>
            <p className={page.intro}>寺廟定裝版已確認。創作對話將在之後的版本開放。</p>
          </>
        )}
      </main>
    </div>
  );
}
