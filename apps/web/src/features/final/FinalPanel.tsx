import { useMutation, useQuery } from '@tanstack/react-query';
import { formatClock, generatedClipSec, imageModelLabel, thumbnailStrip, videoModelLabel, type ClipsResponse, type PlanRules, type Shot, type Video } from '@templeyard/shared';
import { useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiRequestError, assetUrl, confirmFinal, copyVideo, finalDownloadUrl, postCostEstimate, startClips } from '../../api/client';
import { Button } from '../../components/Button';
import { Tag } from '../../components/Tag';
import { useCostConsent } from '../costs/useCostConsent';
import styles from './FinalPanel.module.css';

export function clipsKey(videoId: string) {
  return ['clips', videoId] as const;
}

type FinalPanelProps = {
  video: Video;
  data: ClipsResponse;
  shots: readonly Shot[];
  /** 方案的規則：影片模型的最短生成長度（預估重生秒數用） */
  rules: PlanRules | null;
  /** 重生並重新合成已送出 */
  onRegenerating: () => void;
  /** 確認成品後重新讀取影片資料 */
  onConfirmed: () => void;
};

function messageOf(error: unknown): string {
  return error instanceof ApiRequestError ? error.message : '請再試一次';
}

/** 成品面板（04「成品」）：播放器、依秒數比例的各格縮圖、模型與規格資訊；對話修改後重生、確認並下載、複製這支影片 */
export function FinalPanel({ video, data, shots, rules, onRegenerating, onConfirmed }: FinalPanelProps) {
  const titleId = useId();
  const navigate = useNavigate();
  const player = useRef<HTMLVideoElement>(null);
  const [playingFrom, setPlayingFrom] = useState<string | null>(null);
  const [regenError, setRegenError] = useState<string | null>(null);
  const consent = useCostConsent(video.id);
  const final = data.final;
  const strip = thumbnailStrip(shots);
  const revisions = data.shots.filter((shot) => shot.clip?.revision);
  // 重生前先顯示費用（F16）：需重新確認的格子要生成的秒數（短於模型最短長度時照最短長度）
  const redoSec = data.shots
    .filter((shot) => shot.clip?.needsReconfirm)
    .reduce((sum, shot) => {
      const card = shots.find((s) => s.shotKey === shot.shotKey);
      return sum + (card ? generatedClipSec(card.durationSec, { min: rules?.minGenerationSec ?? undefined }) : 0);
    }, 0);
  const estimate = useQuery({
    queryKey: ['redo-estimate', video.id, video.videoModel, redoSec],
    queryFn: () => postCostEstimate(video.id, [{ model: video.videoModel, units: redoSec }]),
    enabled: redoSec > 0,
  });
  const credits = estimate.data?.estimate.credits;
  const estimateText =
    redoSec > 0 && estimate.data ? `預估：${videoModelLabel(video.videoModel)} × ${redoSec} 秒，${credits === null || credits === undefined ? '單價待實測，無法預估' : `約 ${credits} 點`}` : null;

  const download = useMutation({
    mutationFn: async () => {
      await confirmFinal(video.id);
      // 確認後下載 MP4
      const link = document.createElement('a');
      link.href = finalDownloadUrl(video.id);
      link.download = '';
      document.body.append(link);
      link.click();
      link.remove();
    },
    onSuccess: onConfirmed,
  });
  const copy = useMutation({
    mutationFn: () => copyVideo(video.id),
    onSuccess: (copied) => navigate(`/series/${copied.seriesId}/videos/new?video=${copied.id}`),
  });

  function jumpTo(item: (typeof strip)[number]) {
    const element = player.current;
    if (element) {
      element.currentTime = item.startSec;
      void element.play().catch(() => undefined);
    }
    setPlayingFrom(`從第 ${item.seq} 格（${formatClock(item.startSec)}）開始播放`);
  }

  // 只重生需重新確認的格子並重新合成；先取得預估，需要同意時顯示費用確認
  async function regenerate() {
    setRegenError(null);
    try {
      const first = await startClips(video.id, undefined);
      if (first.status === 'started') {
        onRegenerating();
        return;
      }
      await consent.ask({
        items: first.items,
        confirmLabel: '同意並生成',
        run: async (token) => {
          const outcome = await startClips(video.id, token);
          if (outcome.status !== 'started') throw new ApiRequestError('費用同意沒有通過，請再試一次', 409);
          onRegenerating();
        },
      });
    } catch (cause: unknown) {
      setRegenError(messageOf(cause));
    }
  }

  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        成品
      </h2>
      {final ? (
        <>
          <video ref={player} className={styles.player} controls preload="metadata" src={assetUrl(final.assetId)} aria-label="成品影片" />
          {playingFrom && (
            <p className={styles.muted} aria-live="polite">
              {playingFrom}
            </p>
          )}
          <ul className={styles.strip} aria-label="各格縮圖">
            {strip.map((item) => (
              <li key={item.shotKey} className={styles.thumb} style={{ flex: `${item.ratio} 1 0` }}>
                <button type="button" className={styles.thumbButton} onClick={() => jumpTo(item)}>
                  {`第 ${item.seq} 格`}
                </button>
                <Link className={styles.link} to={`/videos/${video.id}/shots/${item.shotKey}?from=final`}>
                  {`細修：第 ${item.seq} 格`}
                </Link>
              </li>
            ))}
          </ul>
          <p className={styles.spec}>{`${final.width}×${final.height}・${final.fps} fps・${final.durationSec} 秒`}</p>
          <dl className={styles.facts}>
            <div>
              <dt>圖片模型</dt>
              <dd>{imageModelLabel(video.imageModel)}</dd>
            </div>
            <div>
              <dt>影片模型</dt>
              <dd>{videoModelLabel(video.videoModel)}</dd>
            </div>
          </dl>
          {final.needsReconfirm && <Tag tone="warning">需重新確認</Tag>}
          {revisions.length > 0 && (
            <ul className={styles.revisions} aria-label="要重生的格子">
              {revisions.map((shot) => (
                <li key={shot.shotKey}>{`要重生：第 ${shot.seq} 格（${shot.clip?.revision ?? ''}）`}</li>
              ))}
            </ul>
          )}
          {estimateText && <p className={styles.spec}>{estimateText}</p>}
          <div className={styles.actions}>
            {final.needsReconfirm && (
              <Button disabled={consent.busy} onClick={() => void regenerate()}>
                重生並重新合成
              </Button>
            )}
            <Button variant="primary" disabled={final.needsReconfirm || download.isPending} onClick={() => download.mutate()}>
              確認並下載
            </Button>
            <Button disabled={copy.isPending} onClick={() => copy.mutate()}>
              複製這支影片
            </Button>
          </div>
          {final.needsReconfirm && <p className={styles.muted}>成品需重新確認：重生需重新確認的格子並重新合成後，才能下載。</p>}
        </>
      ) : (
        <p className={styles.muted}>還沒有成品。</p>
      )}
      {data.composeError && (
        <p className={styles.error} role="alert">
          {`成品合成失敗：${data.composeError}`}
        </p>
      )}
      {(regenError ?? consent.error ?? (download.isError ? messageOf(download.error) : null) ?? (copy.isError ? messageOf(copy.error) : null)) && (
        <p className={styles.error} role="alert">
          {regenError ?? consent.error ?? (download.isError ? messageOf(download.error) : messageOf(copy.error))}
        </p>
      )}
      {consent.dialog}
    </section>
  );
}
