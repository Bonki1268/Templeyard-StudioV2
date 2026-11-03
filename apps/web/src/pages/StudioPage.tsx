import { useQuery } from '@tanstack/react-query';
import { imageModelLabel, videoModelLabel, type VideoDetail } from '@templeyard/shared';
import { useId, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { fetchPlan, fetchQuestionnaire, fetchVideoBudget } from '../api/client';
import { PlanPanel, planKey } from '../features/plan/PlanPanel';
import { useSeriesList } from '../features/series/useSeriesList';
import { ChatColumn } from '../features/studio/ChatColumn';
import { HomePanel } from '../features/studio/HomePanel';
import { PANEL_NOT_REACHED, STUDIO_PANELS, reachablePanels, resolvePanel } from '../features/studio/panels';
import { QuestionnairePanel } from '../features/studio/QuestionnairePanel';
import { questionnaireKey, useStudioChat } from '../features/studio/useStudioChat';
import { useVideoDetail } from '../features/videos/useVideoDetail';
import page from './CreateVideoPage.module.css';
import styles from './StudioPage.module.css';

// 創作工作區（/videos/:vid/studio）：進入條件是寺廟定裝版已確認（03 路由表）。
// 左欄是與創作 Agent 的對話；右欄依 ?panel= 顯示面板，上方的選單可以切回到達過的面板。
export function StudioPage() {
  const { vid = '' } = useParams();
  const detail = useVideoDetail(vid);
  const video = detail.data?.video;
  const boardPending = video !== undefined && (video.stage === 'creating' || video.stage === 'board_pending');

  return (
    <div className={page.page}>
      {detail.isError && (
        <main className={page.main}>
          <p className={page.error} role="alert">
            讀不到這支影片：{detail.error.message}
          </p>
        </main>
      )}
      {boardPending && (
        <main className={page.main}>
          <h1 className={page.title}>創作工作區</h1>
          <p className={page.error} role="alert">
            寺廟定裝版還沒確認，還不能開始創作。
            {video.templeBoardVersionId ? (
              <Link to={`/videos/${vid}/temple-board`}>回到寺廟定裝版</Link>
            ) : (
              <Link to={`/series/${video.seriesId}/videos/new?video=${vid}`}>回到建立影片</Link>
            )}
          </p>
        </main>
      )}
      {detail.data && !boardPending && <Workspace detail={detail.data} />}
    </div>
  );
}

function Workspace({ detail }: { detail: VideoDetail }) {
  const videoId = detail.video.id;
  const panelSelectId = useId();
  const [searchParams, setSearchParams] = useSearchParams();
  const series = useSeriesList().data?.find((item) => item.id === detail.video.seriesId);
  const budget = useQuery({ queryKey: ['budget', videoId], queryFn: () => fetchVideoBudget(videoId) });
  const questionnaire = useQuery({ queryKey: questionnaireKey(videoId), queryFn: () => fetchQuestionnaire(videoId) });
  const plan = useQuery({
    queryKey: planKey(videoId),
    queryFn: () => fetchPlan(videoId),
    // 角色定裝圖或補充視角生成中：每 1.5 秒重新讀取，完成後停止
    refetchInterval: (query) => {
      const data = query.state.data;
      const generating = data?.characters.some((c) => c.state === 'generating') || data?.views.some((v) => v.state === 'generating');
      return generating ? 1500 : false;
    },
  });
  const chat = useStudioChat(videoId);
  const [savedVersion, setSavedVersion] = useState<number | null>(null);

  const progress = { hasQuestionnaire: Boolean(questionnaire.data), hasPlan: Boolean(plan.data?.plan) };
  const reachable = reachablePanels(progress);
  const panel = resolvePanel(searchParams.get('panel'), progress);

  async function send(content: string) {
    const calls = await chat.send(content);
    // Agent 開啟了問卷：切到問卷面板
    if (calls?.some((call) => call.name === 'generate_questionnaire' && call.ok)) setSearchParams({ panel: 'questionnaire' });
  }

  return (
    <>
      <header className={styles.header}>
        <Link to="/" className={page.brand}>
          <span className={page.mark} aria-hidden="true">
            廟
          </span>
          廟埕影室
        </Link>
        <h1 className={styles.title}>創作工作區</h1>
        <dl className={styles.facts}>
          <div>
            <dt>寺廟</dt>
            <dd>{detail.temple.name}</dd>
          </div>
          <div>
            <dt>系列</dt>
            <dd>{series?.name ?? '讀取中'}</dd>
          </div>
          <div>
            <dt>圖片模型</dt>
            <dd>{imageModelLabel(detail.video.imageModel)}</dd>
          </div>
          <div>
            <dt>影片模型</dt>
            <dd>{videoModelLabel(detail.video.videoModel)}</dd>
          </div>
          <div>
            <dt>費用</dt>
            <dd className={styles.cost}>
              {budget.data ? (
                <>
                  <span>已用 {budget.data.spent} 點</span>
                  <span>{budget.data.limit === null ? '上限未設定' : `上限 ${budget.data.limit} 點`}</span>
                </>
              ) : (
                '讀取中'
              )}
            </dd>
          </div>
        </dl>
      </header>

      <main className={styles.layout}>
        <ChatColumn messages={chat.messages} live={chat.live} sending={chat.sending} error={chat.error} onSend={(content) => void send(content)} />

        <div className={styles.workspace}>
          <div className={styles.panelPicker}>
            <label htmlFor={panelSelectId}>面板</label>
            <select id={panelSelectId} value={panel} onChange={(event) => setSearchParams({ panel: event.target.value })}>
              {STUDIO_PANELS.map((item) => {
                const reached = reachable.includes(item.key);
                return (
                  <option key={item.key} value={item.key} disabled={!reached}>
                    {reached ? item.label : `${item.label}（${PANEL_NOT_REACHED}）`}
                  </option>
                );
              })}
            </select>
          </div>

          {panel === 'home' && <HomePanel videoId={videoId} templeName={detail.temple.name} sending={chat.sending} onSend={(content) => void send(content)} />}
          {panel === 'questionnaire' && questionnaire.data && (
            <QuestionnairePanel
              key={`${questionnaire.data.id}-${JSON.stringify(questionnaire.data.answers.map(({ source: _source, ...rest }) => rest))}`}
              videoId={videoId}
              questionnaire={questionnaire.data}
              photos={detail.photos}
              hasPlan={progress.hasPlan}
              onPlanReady={() => setSearchParams({ panel: 'plan' })}
            />
          )}
          {panel === 'plan' && plan.data?.plan && (
            <PlanPanel key={plan.data.plan.id} savedVersion={savedVersion} onSaved={setSavedVersion} videoId={videoId} data={{ ...plan.data, plan: plan.data.plan }} seriesVisualStyle={series?.visualStyle ?? ''} imageModel={detail.video.imageModel} />
          )}
        </div>
      </main>
    </>
  );
}
