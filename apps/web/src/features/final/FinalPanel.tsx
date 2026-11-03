import type { ClipsResponse } from '@templeyard/shared';
import { useId } from 'react';
import { assetUrl } from '../../api/client';
import { Tag } from '../../components/Tag';
import styles from './FinalPanel.module.css';

export function clipsKey(videoId: string) {
  return ['clips', videoId] as const;
}

/** 成品面板（第 11 階段先做播放器與規格；縮圖條、對話修改、下載在第 12 階段） */
export function FinalPanel({ data }: { data: ClipsResponse }) {
  const titleId = useId();
  const final = data.final;
  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        成品
      </h2>
      {final ? (
        <>
          <video className={styles.player} controls preload="metadata" src={assetUrl(final.assetId)} aria-label="成品影片" />
          <p className={styles.spec}>{`${final.width}×${final.height}・${final.fps} fps・${final.durationSec} 秒`}</p>
          {final.needsReconfirm && <Tag tone="warning">需重新確認</Tag>}
        </>
      ) : (
        <p className={styles.muted}>還沒有成品。</p>
      )}
      {data.composeError && (
        <p className={styles.error} role="alert">
          {`成品合成失敗：${data.composeError}`}
        </p>
      )}
    </section>
  );
}
