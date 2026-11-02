import { useId } from 'react';
import { SeriesCard } from '../features/series/SeriesCard';
import { SeriesCreateForm } from '../features/series/SeriesCreateForm';
import { useSeriesList } from '../features/series/useSeriesList';
import styles from './SeriesHomePage.module.css';

// 系列首頁（/）：左邊系列列表，右邊建立新系列
export function SeriesHomePage() {
  const listTitleId = useId();
  const formTitleId = useId();
  const seriesList = useSeriesList();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.mark} aria-hidden="true">
          廟
        </span>
        <h1 className={styles.title}>廟埕影室</h1>
      </header>

      <main className={styles.layout}>
        <section aria-labelledby={listTitleId}>
          <h2 id={listTitleId} className={styles.sectionTitle}>
            你的系列
          </h2>
          <p className={styles.sectionIntro}>一個系列共用風格、秒數、方向與預設模型，可以用一致的樣子介紹多間廟。</p>

          {seriesList.isPending && (
            <p className={styles.status} role="status">
              正在讀取系列…
            </p>
          )}
          {seriesList.isError && (
            <p className={styles.error} role="alert">
              讀不到系列列表：{seriesList.error.message}
            </p>
          )}
          {seriesList.isSuccess && seriesList.data.length === 0 && (
            <p className={styles.status}>還沒有系列，先在旁邊建立第一個系列。</p>
          )}
          {seriesList.isSuccess && seriesList.data.length > 0 && (
            <ul className={styles.list}>
              {seriesList.data.map((series) => (
                <li key={series.id}>
                  <SeriesCard series={series} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby={formTitleId}>
          <h2 id={formTitleId} className={styles.sectionTitle}>
            建立新系列
          </h2>
          <SeriesCreateForm titleId={formTitleId} />
        </section>
      </main>
    </div>
  );
}
