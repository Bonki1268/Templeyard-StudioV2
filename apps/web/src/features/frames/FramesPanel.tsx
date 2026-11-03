import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FRAME_SHOT_STATE_LABELS, clipBlockers, frameShotState, type ClipsResponse, type FramesResponse, type ShotFrames } from '@templeyard/shared';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { ApiRequestError, confirmFrame, regenerateFrame, startClips } from '../../api/client';
import { Button } from '../../components/Button';
import { Tag, type TagTone } from '../../components/Tag';
import { useCostConsent } from '../costs/useCostConsent';
import styles from './FramesPanel.module.css';

export function framesKey(videoId: string) {
  return ['frames', videoId] as const;
}

const TONES: Record<ReturnType<typeof frameShotState>, TagTone> = {
  generating: 'info',
  failed: 'error',
  pending_confirm: 'warning',
  needs_reconfirm: 'warning',
  confirmed: 'success',
  missing: 'neutral',
};

type FramesPanelProps = {
  videoId: string;
  imageModel: string;
  data: FramesResponse;
  /** 影片的狀態（第 11 階段）：失敗的格子與合成錯誤顯示在這裡 */
  clips?: ClipsResponse | undefined;
  onRegenerated: () => void;
  /** 影片生成已送出 */
  onClipsStarted?: () => void;
};

/** 生成中：只顯示「生成中」與內容類型，不逐格顯示進度（規格書「生成中」） */
export function GeneratingPanel({ label }: { label: string | null }) {
  const titleId = useId();
  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <div className={styles.generating} role="status" aria-live="polite">
        <span className={styles.spinner} data-testid="generating-indicator" aria-hidden="true" />
        <h2 id={titleId} className={styles.title}>
          生成中
        </h2>
        <p className={styles.label}>{label ?? '精緻圖'}</p>
      </div>
      <p className={styles.muted}>可以先離開這個畫面，完成後會一次顯示結果；允許通知時也會通知你。</p>
    </section>
  );
}

function ShotCard({ videoId, imageModel, shot, onRegenerated }: { videoId: string; imageModel: string; shot: ShotFrames; onRegenerated: () => void }) {
  const queryClient = useQueryClient();
  const consent = useCostConsent(videoId);
  const state = frameShotState(shot);
  const name = `第 ${shot.seq} 格`;
  const confirm = useMutation({
    mutationFn: () => confirmFrame(videoId, shot.shotKey),
    onSuccess: (data) => queryClient.setQueryData(framesKey(videoId), data),
  });

  function regenerate() {
    void consent.ask({
      items: [{ model: imageModel, units: 1 }],
      confirmLabel: '同意並重生',
      run: async (consentToken) => {
        await regenerateFrame(videoId, shot.shotKey, consentToken);
        onRegenerated();
      },
    });
  }

  return (
    <article className={`${styles.card} ${state === 'needs_reconfirm' ? styles.cardWarning : ''}`} aria-label={name}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>{name}</h3>
        <Tag tone={TONES[state]}>{FRAME_SHOT_STATE_LABELS[state]}</Tag>
      </div>
      <div className={styles.images}>
        {shot.first?.assetId && <img src={`/api/assets/${shot.first.assetId}`} alt={`${name}首格`} />}
        {shot.needsLast && shot.last?.assetId && <img src={`/api/assets/${shot.last.assetId}`} alt={`${name}末格`} />}
      </div>
      {shot.first?.error && <p className={styles.error}>{shot.first.error}</p>}
      <div className={styles.actions}>
        {(state === 'pending_confirm' || state === 'needs_reconfirm') && (
          <Button variant="primary" disabled={confirm.isPending} onClick={() => confirm.mutate()}>
            {`確認：${name}`}
          </Button>
        )}
        <Button disabled={consent.busy} onClick={regenerate}>
          {`重生：${name}`}
        </Button>
        <Link className={styles.link} to={`/videos/${videoId}/shots/${shot.shotKey}?from=frames`}>
          {`細修：${name}`}
        </Link>
      </div>
      {(consent.error || confirm.isError) && (
        <p className={styles.error} role="alert">
          {consent.error ?? (confirm.error instanceof ApiRequestError ? confirm.error.message : '請再試一次')}
        </p>
      )}
      {consent.dialog}
    </article>
  );
}

/** 精緻圖面板：每格的首格（需要時加末格），逐格確認或重生；所有格都確認後才能生成影片 */
export function FramesPanel({ videoId, imageModel, data, clips, onRegenerated, onClipsStarted }: FramesPanelProps) {
  const titleId = useId();
  const blockers = clipBlockers(data.shots);
  const consent = useCostConsent(videoId);
  const [startError, setStartError] = useState<string | null>(null);
  const failed = (clips?.shots ?? []).filter((shot) => shot.clip?.state === 'failed');

  // 先不帶憑證送出取得預估（影片秒數與背景音樂），需要同意時顯示費用確認
  async function generateClips() {
    setStartError(null);
    try {
      const first = await startClips(videoId, undefined);
      if (first.status === 'started') {
        onClipsStarted?.();
        return;
      }
      await consent.ask({
        items: first.items,
        confirmLabel: '同意並生成',
        run: async (token) => {
          const outcome = await startClips(videoId, token);
          if (outcome.status !== 'started') throw new ApiRequestError('費用同意沒有通過，請再試一次', 409);
          onClipsStarted?.();
        },
      });
    } catch (cause: unknown) {
      setStartError(cause instanceof ApiRequestError ? cause.message : '送出失敗，請再試一次');
    }
  }
  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        精緻圖
      </h2>
      <ol className={styles.grid} aria-label="精緻圖">
        {data.shots.map((shot) => (
          <li key={shot.shotKey}>
            <ShotCard videoId={videoId} imageModel={imageModel} shot={shot} onRegenerated={onRegenerated} />
          </li>
        ))}
      </ol>
      <div className={styles.footer}>
        {blockers.length > 0 ? (
          <div>
            <p className={styles.muted}>還不能生成影片的原因：</p>
            <ul className={styles.blockers} aria-label="還不能生成影片的原因">
              {blockers.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className={styles.muted}>所有格都確認了，可以生成影片；完成後會在本機合成成品。</p>
        )}
        <Button variant="primary" disabled={blockers.length > 0 || consent.busy} onClick={() => void generateClips()}>
          生成影片
        </Button>
      </div>
      {failed.length > 0 && (
        <ul className={styles.blockers} aria-label="影片生成失敗">
          {failed.map((shot) => (
            <li key={shot.shotKey}>{`第 ${shot.seq} 格：影片生成失敗${shot.clip?.error ? `（${shot.clip.error}）` : ''}，按「生成影片」只重做失敗的格子`}</li>
          ))}
        </ul>
      )}
      {clips?.composeError && (
        <p className={styles.error} role="alert">
          {`成品合成失敗：${clips.composeError}`}
        </p>
      )}
      {(startError ?? consent.error) && (
        <p className={styles.error} role="alert">
          {startError ?? consent.error}
        </p>
      )}
      {consent.dialog}
    </section>
  );
}
