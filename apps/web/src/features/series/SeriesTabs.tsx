import { NavLink, useLocation } from 'react-router';
import { useLeaveGuard } from './LeaveGuard';
import styles from './SeriesTabs.module.css';

// 系列頁的三個分頁（設計稿 Main／Characters／Videos）：連結切換，目前分頁 aria-current="page"，旁邊顯示數量

export type SeriesTabsProps = { seriesId: string; characterCount: number | null; videoCount: number | null };

export function SeriesTabs({ seriesId, characterCount, videoCount }: SeriesTabsProps) {
  const { pathname } = useLocation();
  const guard = useLeaveGuard();
  const base = `/series/${seriesId}`;
  const tabs = [
    { to: `${base}/settings`, label: '系列設定', count: null, current: pathname === `${base}/settings` },
    { to: `${base}/characters`, label: '角色庫', count: characterCount, current: pathname.startsWith(`${base}/characters`) },
    { to: `${base}/videos`, label: '過去的影片', count: videoCount, current: pathname === `${base}/videos` },
  ];
  return (
    <nav aria-label="系列頁面" className={styles.tabs}>
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={styles.tab}
          aria-current={tab.current ? 'page' : undefined}
          onClick={(event) => guard.intercept(event, tab.to)}
        >
          {tab.label}
          {tab.count !== null && <span className={styles.count}>{tab.count}</span>}
        </NavLink>
      ))}
    </nav>
  );
}
