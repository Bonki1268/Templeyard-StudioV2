import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  characterBlockers,
  checkPlan,
  estimateDialogueSec,
  missingViews,
  planVersionLabel,
  withTimeline,
  type Plan,
  type PlanResponse,
  type Shot,
  type ShotInput,
} from '@templeyard/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { ApiRequestError, addSupplementalView, confirmSupplementalView, fetchPlanVersion, postPlanVersion } from '../../api/client';
import { Tag } from '../../components/Tag';
import { useCostConsent } from '../costs/useCostConsent';
import { CharacterCard } from './CharacterCard';
import { Button } from '../../components/Button';
import { addShot, duplicateShot, generateBlockers, moveShot, removeShot, toInputs, withDurations } from './planEditor';
import styles from './PlanPanel.module.css';
import { ShotCard } from './ShotCard';
import { Timeline } from './Timeline';

export function planKey(videoId: string) {
  return ['plan', videoId] as const;
}

type PlanPanelProps = {
  videoId: string;
  data: PlanResponse & { plan: Plan };
  seriesVisualStyle: string;
  /** 這支影片的圖片模型（補充視角的費用） */
  imageModel: string;
  /** 最近一次存成的版本（放在上層：存檔後面板會以新版本重新開始） */
  savedVersion: number | null;
  onSaved: (version: number) => void;
};

/** 畫面上顯示用：送出前的卡片也要有序號、時間與估時 */
function preview(inputs: readonly ShotInput[], saved: readonly Shot[]): Shot[] {
  return withTimeline(inputs).map((input, index) => ({
    shotKey: input.shotKey ?? `new-${index}`,
    seq: input.seq,
    startSec: input.startSec,
    durationSec: input.durationSec,
    shotSize: input.shotSize,
    cameraMove: input.cameraMove ?? saved[index]?.cameraMove ?? '固定',
    cameraSpeed: input.cameraSpeed ?? '',
    cameraAngle: input.cameraAngle ?? '',
    description: input.description ?? '',
    actionStart: input.actionStart ?? '',
    actionEnd: input.actionEnd ?? '',
    viewKey: input.viewKey ?? '',
    lighting: input.lighting ?? '',
    characters: input.characters ?? [],
    dialogue: input.dialogue ?? '',
    speaker: input.speaker ?? '',
    subtitle: input.subtitle ?? '',
    photoId: input.photoId ?? null,
    keyframesEnabled: input.keyframesEnabled ?? false,
    keyframeTimes: input.keyframeTimes ?? [],
    customPrompt: input.customPrompt ?? null,
    factSources: input.factSources ?? [],
    dialogueEstimateSec: estimateDialogueSec(input.dialogue ?? ''),
  }));
}

/**
 * 分鏡方案面板：上方風格、角色、場景三張卡；中間時間軸；下方分鏡卡片；底部列出還不能生成的原因。
 * 上層以現行版本當 key：版本換了（存檔、對話修改、回到舊版）就從新的版本重新開始編輯。
 */
export function PlanPanel({ videoId, data, seriesVisualStyle, imageModel, savedVersion, onSaved }: PlanPanelProps) {
  const titleId = useId();
  const versionSelectId = useId();
  const queryClient = useQueryClient();
  const current = data.plan;
  const [selected, setSelected] = useState(current.version);
  const [drafts, setDrafts] = useState<ShotInput[]>(() => toInputs(current.shots));
  const dragFrom = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const old = useQuery({
    queryKey: ['plan-version', videoId, selected],
    queryFn: () => fetchPlanVersion(videoId, selected),
    enabled: selected !== current.version,
  });

  const save = useMutation({
    mutationFn: (input: { shots?: ShotInput[]; revertTo?: number }) => postPlanVersion(videoId, { baseVersion: current.version, ...input }),
    onSuccess: async (plan) => {
      onSaved(plan.version);
      await queryClient.invalidateQueries({ queryKey: planKey(videoId) });
    },
    onError: async () => {
      await queryClient.invalidateQueries({ queryKey: planKey(videoId) });
    },
  });

  function commit(next: ShotInput[]) {
    setDrafts(next);
    save.mutate({ shots: next });
  }

  /** 時間軸拖曳：畫面先跟著動，停下來 0.6 秒後才存成新版本 */
  function changeDurations(durations: number[]) {
    const next = withDurations(drafts, durations);
    setDrafts(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save.mutate({ shots: next }), 600);
  }

  const viewingOld = selected !== current.version;
  const shots = viewingOld ? (old.data?.shots ?? []) : preview(drafts, current.shots);
  const check = checkPlan(shots, data.rules);
  const blockers = generateBlockers(checkPlan(preview(drafts, current.shots), data.rules), characterBlockers(data.characters));
  const missing = missingViews(shots);
  const sceneConsent = useCostConsent(videoId);
  const confirmView = useMutation({ mutationFn: (viewKey: string) => confirmSupplementalView(videoId, viewKey), onSettled: refresh });
  const sceneBusy = sceneConsent.busy || confirmView.isPending;

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: planKey(videoId) });
  }

  function supplement(name: string) {
    void sceneConsent.ask({
      items: [{ model: imageModel, units: 1 }],
      confirmLabel: '同意並產生',
      run: async (consentToken) => {
        await addSupplementalView(videoId, name, consentToken);
        await refresh();
      },
    });
  }
  const busy = save.isPending;

  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <div className={styles.header}>
        <h2 id={titleId} className={styles.panelTitle}>
          分鏡方案
        </h2>
        <div className={styles.versions}>
          <label htmlFor={versionSelectId}>方案版本</label>
          <select id={versionSelectId} value={selected} onChange={(event) => setSelected(Number(event.target.value))}>
            {[...data.versions].reverse().map((version) => (
              <option key={version.version} value={version.version}>
                {planVersionLabel(version)}
              </option>
            ))}
          </select>
          {viewingOld && (
            <Button disabled={busy || !old.data} onClick={() => save.mutate({ revertTo: selected })}>
              回到這一版
            </Button>
          )}
        </div>
      </div>
      {viewingOld && <p className={styles.notice}>正在看舊的版本；按「回到這一版」會另存為新版本，不會覆蓋。</p>}
      <p className={styles.status} role="status">
        {savedVersion !== null && !busy ? `已存成第 ${savedVersion} 版` : ''}
      </p>
      {save.isError && (
        <p className={styles.error} role="alert">
          修改沒有存到：{save.error instanceof ApiRequestError ? save.error.message : '請再試一次'}
        </p>
      )}

      <div className={styles.overview}>
        <section className={styles.overviewCard} aria-label="風格">
          <h3 className={styles.overviewTitle}>風格</h3>
          <p>{seriesVisualStyle}</p>
          <p className={styles.meta}>{current.styleNote}</p>
        </section>
        <section className={styles.overviewCard} aria-label="場景">
          <h3 className={styles.overviewTitle}>場景</h3>
          <ul className={styles.plainList}>
            {data.views.map((view) => (
              <li key={view.viewKey} className={styles.viewItem}>
                <span>{view.viewName}</span>
                {view.state === 'generating' && <Tag tone="info">生成中</Tag>}
                {view.state === 'failed' && <Tag tone="error">生成失敗</Tag>}
                {view.state === 'ready' && view.source === 'ai_inferred' && (
                  <Tag tone={view.confirmed ? 'success' : 'warning'}>{view.confirmed ? 'AI 推測・已確認' : 'AI 推測・待確認'}</Tag>
                )}
                {view.viewKey.startsWith('custom:') && view.state === 'ready' && !view.confirmed && (
                  <Button disabled={sceneBusy} onClick={() => confirmView.mutate(view.viewKey)}>
                    {`確認視角：${view.viewName}`}
                  </Button>
                )}
              </li>
            ))}
            {missing.map((name) => (
              <li key={`missing-${name}`} className={styles.viewItem}>
                <span>{`缺少視角：${name}`}</span>
                <Button disabled={sceneBusy || viewingOld} onClick={() => supplement(name)}>
                  {`補充視角：${name}`}
                </Button>
              </li>
            ))}
          </ul>
          {(sceneConsent.error || confirmView.isError) && (
            <p className={styles.error} role="alert">
              {sceneConsent.error ?? (confirmView.error instanceof ApiRequestError ? confirmView.error.message : '請再試一次')}
            </p>
          )}
          {sceneConsent.dialog}
        </section>
      </div>

      <section className={styles.characters} aria-label="角色">
        <h3 className={styles.overviewTitle}>角色</h3>
        {data.characters.length === 0 ? (
          <p className={styles.meta}>這版方案沒有角色</p>
        ) : (
          data.characters.map((character) => <CharacterCard key={`${character.id}-${character.version.id}`} videoId={videoId} character={character} onChanged={refresh} />)
        )}
      </section>

      <Timeline shots={shots} totalSec={check.totalSec} targetSec={check.targetSec} onChange={changeDurations} disabled={viewingOld || busy} />

      <ol className={styles.cards} aria-label="分鏡卡片">
        {shots.map((shot, index) => (
          <li key={`${current.version}-${selected}-${shot.shotKey}-${index}`}>
            <ShotCard
              shot={shot}
              check={check.shots[shot.shotKey]}
              views={data.views}
              index={index}
              count={shots.length}
              readOnly={viewingOld}
              busy={busy}
              onChange={(patch) => commit(drafts.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)))}
              onMove={(to) => commit(moveShot(drafts, index, to))}
              onDuplicate={() => commit(duplicateShot(drafts, index))}
              onRemove={() => commit(removeShot(drafts, index))}
              onDragStart={() => {
                dragFrom.current = index;
              }}
              onDrop={() => {
                const from = dragFrom.current;
                dragFrom.current = null;
                if (from !== null && from !== index) commit(moveShot(drafts, from, index));
              }}
            />
          </li>
        ))}
      </ol>
      {!viewingOld && (
        <div>
          <Button disabled={busy} onClick={() => commit(addShot(drafts))}>
            新增一格
          </Button>
        </div>
      )}

      <div className={styles.generate}>
        <div>
          <p className={styles.meta}>還不能生成的原因：</p>
          <ul className={styles.blockers} aria-label="還不能生成的原因">
            {blockers.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
        <Button variant="primary" disabled>
          生成
        </Button>
      </div>
    </section>
  );
}
