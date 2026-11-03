import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CAMERA_ANGLES,
  CAMERA_MOVES,
  KEYFRAME_REMINDER,
  MAX_CANDIDATES,
  SHOT_SIZES,
  estimateDialogueSec,
  formatClock,
  keyframeTimesError,
  parseKeyframeTimes,
  suggestKeyframeTimes,
  videoModelLabel,
  type Frame,
  type ShotDetail,
} from '@templeyard/shared';
import { useId, useState, type MouseEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  ApiRequestError,
  editShotRegion,
  fetchPlan,
  fetchShotDetail,
  fetchVideoDetail,
  generateShotKeyframes,
  patchShot,
  regenerateFrame,
  selectShotFrame,
  uploadShotFrame,
} from '../api/client';
import { Button } from '../components/Button';
import { Tag } from '../components/Tag';
import { TextField } from '../components/TextField';
import { useAiAssist } from '../features/assist/useAiAssist';
import { useCostConsent } from '../features/costs/useCostConsent';
import { boxesFromDetections } from '../features/deid/boxes';
import { getFaceDetector } from '../features/deid/faceDetector';
import { DEID_OUTPUT_MIME, blobToBase64, loadImage, renderDeidentified } from '../features/deid/render';
import { planKey } from '../features/plan/PlanPanel';
import { draftFromShot, isDirty, patchFrom, percentBox, type ShotDraft } from '../features/shotDetail/shotDraft';
import { ChatColumn } from '../features/studio/ChatColumn';
import { useStudioChat } from '../features/studio/useStudioChat';
import page from './CreateVideoPage.module.css';
import styles from './ShotDetailPage.module.css';

// 分鏡細修（/videos/:vid/shots/:shotKey）：上方縮圖列、中間預覽、下方單格時間軸、右側設定；左欄的對話只針對這一格

function shotKey(videoId: string, key: string) {
  return ['shot', videoId, key] as const;
}

/** 「0:03.3」：一位小數的時間 */
function clockWithTenths(sec: number): string {
  const whole = Math.floor(sec);
  const tenths = Math.round((sec - whole) * 10);
  return tenths === 0 ? formatClock(whole) : `${formatClock(whole)}.${tenths}`;
}

/** 圖的狀態標籤 */
function frameTags(frame: Frame & { userUploaded?: boolean }): string[] {
  const tags: string[] = [];
  if (frame.userUploaded) tags.push('使用者上傳');
  if (frame.state === 'generating') tags.push('生成中');
  else if (frame.state === 'failed') tags.push('生成失敗');
  else if (frame.needsReconfirm) tags.push('需重新確認');
  else if (frame.selected) tags.push('已確認');
  else tags.push('待確認');
  return tags;
}

/** 版本清單裡這張圖的名稱：「首格第 2 張」「第 3 秒關鍵畫格第 1 張」 */
function versionNames(detail: ShotDetail): Map<string, string> {
  const counts = new Map<string, number>();
  const names = new Map<string, string>();
  for (const version of detail.versions) {
    const base = version.kind === 'first' ? '首格' : version.kind === 'last' ? '末格' : `第 ${version.atSec ?? 0} 秒關鍵畫格`;
    const n = (counts.get(base) ?? 0) + 1;
    counts.set(base, n);
    names.set(version.id, `${base}第 ${n} 張`);
  }
  return names;
}

export function ShotDetailPage() {
  const { vid = '', shotKey: key = '' } = useParams();
  const [searchParams] = useSearchParams();
  const from = searchParams.get('from') ?? 'plan';
  const detail = useQuery({
    queryKey: shotKey(vid, key),
    queryFn: () => fetchShotDetail(vid, key),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data && [data.first, data.last, ...data.keyframes, ...data.versions].some((f) => f?.state === 'generating') ? 1000 : false;
    },
  });
  const plan = useQuery({ queryKey: planKey(vid), queryFn: () => fetchPlan(vid) });
  const chat = useStudioChat(vid, key);
  // 費用確認放在頁面層：儲存後編輯區會依新的卡片重建，對話框不能跟著消失
  const consent = useCostConsent(vid);

  return (
    <div className={page.page}>
      <header className={styles.header}>
        <Link to="/" className={page.brand}>
          <span className={page.mark} aria-hidden="true">
            廟
          </span>
          廟埕影室
        </Link>
        <h1 className={styles.title}>{detail.data ? `分鏡細修・第 ${detail.data.shot.seq} 格` : '分鏡細修'}</h1>
      </header>
      {detail.isError && (
        <main className={page.main}>
          <p className={page.error} role="alert">
            讀不到這一格：{detail.error.message}
          </p>
        </main>
      )}
      {detail.data && plan.data && (
        <Editor
          key={JSON.stringify(detail.data.shot)}
          videoId={vid}
          from={from}
          detail={detail.data}
          plan={plan.data}
          consent={consent}
          chat={<ChatColumn messages={chat.messages} live={chat.live} sending={chat.sending} error={chat.error} onSend={(content) => void chat.send(content)} inputLabel="對 Agent 說（只針對這一格）" />}
        />
      )}
    </div>
  );
}

type EditorProps = {
  videoId: string;
  from: string;
  detail: ShotDetail;
  plan: Awaited<ReturnType<typeof fetchPlan>>;
  chat: ReactNode;
  consent: ReturnType<typeof useCostConsent>;
};

function Editor({ videoId, from, detail, plan, chat, consent }: EditorProps) {
  const shot = detail.shot;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ShotDraft>(() => draftFromShot(shot));
  const [timesText, setTimesText] = useState(shot.keyframeTimes.join('、'));
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState(shot.customPrompt ?? '');
  const [box, setBox] = useState({ left: 10, top: 10, width: 30, height: 30 });
  const [instruction, setInstruction] = useState('');
  const video = useQuery({ queryKey: ['video', videoId], queryFn: () => fetchVideoDetail(videoId) });
  const characters = plan.characters;
  const ids = { region: useId(), instruction: useId() };

  const parsed = parseKeyframeTimes(timesText);
  const times = 'times' in parsed ? parsed.times : [];
  const keyframeError = draft.keyframesEnabled ? ('error' in parsed ? parsed.error : keyframeTimesError(times, draft.durationSec)) : null;
  const effective: ShotDraft = { ...draft, keyframeTimes: draft.keyframesEnabled ? times : draft.keyframeTimes };
  const dirty = isDirty(shot, effective);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['shot', videoId] }),
      queryClient.invalidateQueries({ queryKey: planKey(videoId) }),
      queryClient.invalidateQueries({ queryKey: ['frames', videoId] }),
    ]);
  }

  const save = useMutation({ mutationFn: () => patchShot(videoId, shot.shotKey, patchFrom(shot, effective)), onSuccess: refresh });
  const saveCustom = useMutation({ mutationFn: () => patchShot(videoId, shot.shotKey, { customPrompt: customPrompt.trim() || null }), onSuccess: refresh });
  const select = useMutation({ mutationFn: (frameId: string) => selectShotFrame(videoId, shot.shotKey, frameId), onSuccess: refresh });
  const upload = useMutation({
    mutationFn: async ({ file, kind }: { file: File; kind: 'first' | 'last' }) => {
      // 上傳前一樣在瀏覽器去識別（偵測臉孔並遮蔽），原圖不送到後端
      const image = await loadImage(file);
      const detector = await getFaceDetector();
      const blob = await renderDeidentified(image, boxesFromDetections(await detector.detect(image)));
      await uploadShotFrame(videoId, shot.shotKey, { kind, mime: DEID_OUTPUT_MIME, dataBase64: await blobToBase64(blob) });
    },
    onSuccess: refresh,
  });
  const regionAssist = useAiAssist({
    field: 'shot.regionEdit',
    fieldLabel: '要怎麼改這一處',
    videoId,
    userInput: () => instruction,
    onAdopt: setInstruction,
  });

  function paid(units: number, confirmLabel: string, run: (token: string | undefined) => Promise<void>) {
    void consent.ask({
      items: [{ model: video.data?.video.imageModel ?? '', units }],
      confirmLabel,
      run: async (token) => {
        await run(token);
        await refresh();
      },
    });
  }

  function onSwitch(event: MouseEvent<HTMLAnchorElement>, target: string) {
    if (!dirty) return;
    event.preventDefault();
    setPendingSwitch(target);
  }

  const names = versionNames(detail);
  const currentIds = new Set([detail.first?.id, detail.last?.id, ...detail.keyframes.map((k) => k.id)].filter(Boolean));
  const estimate = estimateDialogueSec(draft.dialogue);
  const linkTo = (target: string) => `/videos/${videoId}/shots/${target}?from=${from}`;

  return (
    <main className={styles.layout}>
      {chat}
      <div className={styles.center}>
        <nav aria-label="分鏡切換" className={styles.thumbs}>
          {plan.plan?.shots.map((s) => (
            <Link key={s.shotKey} to={linkTo(s.shotKey)} aria-current={s.shotKey === shot.shotKey ? 'page' : undefined} onClick={(event) => onSwitch(event, s.shotKey)}>
              {`第 ${s.seq} 格`}
            </Link>
          ))}
        </nav>
        {pendingSwitch && (
          <div className={styles.notice}>
            <p>{`第 ${shot.seq} 格有還沒儲存的修改`}</p>
            <Button
              onClick={() => {
                const target = pendingSwitch;
                setPendingSwitch(null);
                save.mutate(undefined, { onSuccess: () => navigate(linkTo(target)) });
              }}
            >
              儲存後切換
            </Button>
            <Button
              onClick={() => {
                const target = pendingSwitch;
                setPendingSwitch(null);
                navigate(linkTo(target));
              }}
            >
              不儲存，切換
            </Button>
          </div>
        )}

        <section className={styles.preview} aria-label="預覽">
          <FrameFigure name="首格" frame={detail.first} caption={detail.first ? names.get(detail.first.id) : undefined} uploaded={detail.versions.find((v) => v.id === detail.first?.id)?.userUploaded} />
          {detail.keyframes.map((k) => (
            <FrameFigure key={k.id} name={`第 ${k.atSec ?? 0} 秒關鍵畫格`} frame={k} caption={names.get(k.id)} />
          ))}
          {(shot.keyframesEnabled || detail.last) && (
            <FrameFigure
              name="末格"
              frame={detail.last}
              caption={detail.last ? names.get(detail.last.id) : undefined}
              uploaded={detail.versions.find((v) => v.id === detail.last?.id)?.userUploaded}
            />
          )}
        </section>

        <section className={styles.timeline} aria-label="單格時間軸">
          <ul>
            <li>首格 0:00</li>
            {(shot.keyframesEnabled ? shot.keyframeTimes : []).map((t) => (
              <li key={t}>{`關鍵畫格 ${clockWithTenths(t)}`}</li>
            ))}
            <li>{`末格 ${formatClock(shot.durationSec)}`}</li>
            {estimate !== null && <li>{`台詞 0:00–${clockWithTenths(estimate)}`}</li>}
          </ul>
          <p>{`總長度 ${detail.totalSec} 秒／目標長度 ${detail.targetSec} 秒`}</p>
          {/* 偏差比對（第 11 階段）：門檻待實測，只顯示相似度 */}
          {detail.clip?.similarity.map((item) => (
            <p key={item.atSec}>{`第 ${item.atSec} 秒關鍵畫格與影片的相似度：${Math.round(item.score * 100)}%`}</p>
          ))}
        </section>
      </div>

      <section className={styles.settings} aria-label="設定">
        <details open aria-label="內容">
          <summary>內容</summary>
          <TextField label="畫面內容" multiline value={draft.description} onChange={(description) => setDraft({ ...draft, description })} />
          <TextField label="起點" value={draft.actionStart} onChange={(actionStart) => setDraft({ ...draft, actionStart })} />
          <TextField label="終點" value={draft.actionEnd} onChange={(actionEnd) => setDraft({ ...draft, actionEnd })} />
          <TextField label="台詞或旁白" multiline value={draft.dialogue} onChange={(dialogue) => setDraft({ ...draft, dialogue })} />
          <TextField label="說話的角色" value={draft.speaker} onChange={(speaker) => setDraft({ ...draft, speaker })} />
          <TextField label="字幕" value={draft.subtitle} onChange={(subtitle) => setDraft({ ...draft, subtitle })} />
          <TextField label="秒數" value={String(draft.durationSec)} onChange={(value) => setDraft({ ...draft, durationSec: Number(value) || 0 })} />
        </details>

        <details open aria-label="鏡頭">
          <summary>鏡頭</summary>
          <Select label="景別" value={draft.shotSize} options={[...SHOT_SIZES]} onChange={(value) => setDraft({ ...draft, shotSize: value as ShotDraft['shotSize'] })} />
          <Select label="運鏡" value={draft.cameraMove} options={[...new Set([...CAMERA_MOVES, draft.cameraMove].filter(Boolean))]} onChange={(cameraMove) => setDraft({ ...draft, cameraMove })} />
          <TextField label="運鏡速度" value={draft.cameraSpeed} onChange={(cameraSpeed) => setDraft({ ...draft, cameraSpeed })} />
          <Select label="鏡頭角度" value={draft.cameraAngle} options={[...new Set([...CAMERA_ANGLES, draft.cameraAngle].filter(Boolean))]} onChange={(cameraAngle) => setDraft({ ...draft, cameraAngle })} />
        </details>

        <details open aria-label="參考素材">
          <summary>參考素材</summary>
          <fieldset className={styles.checks}>
            <legend>出場角色</legend>
            {characters.length === 0 && <p className={styles.muted}>這版方案沒有角色</p>}
            {characters.map((c) => (
              <label key={c.id}>
                <input
                  type="checkbox"
                  checked={draft.characters.includes(c.name)}
                  onChange={(event) =>
                    setDraft({ ...draft, characters: event.target.checked ? [...draft.characters, c.name] : draft.characters.filter((n) => n !== c.name) })
                  }
                />
                {c.name}
              </label>
            ))}
          </fieldset>
          <Select
            label="場景視角"
            value={draft.viewKey}
            options={plan.views.map((v) => v.viewKey)}
            labels={Object.fromEntries(plan.views.map((v) => [v.viewKey, v.viewName]))}
            onChange={(viewKey) => setDraft({ ...draft, viewKey })}
          />
          <TextField label="光線與時段" value={draft.lighting} onChange={(lighting) => setDraft({ ...draft, lighting })} />
          <Select
            label="對應照片"
            value={draft.photoId ?? ''}
            options={['', ...(video.data?.photos.map((p) => p.id) ?? [])]}
            labels={Object.fromEntries([['', '不指定'], ...(video.data?.photos.map((p, i) => [p.id, `照片 ${i + 1}`]) ?? [])])}
            onChange={(photoId) => setDraft({ ...draft, photoId: photoId || null })}
          />
          {(['first', 'last'] as const).map((kind) => {
            const label = kind === 'first' ? '上傳自己的首格' : '上傳自己的末格';
            return (
              <label key={kind} className={styles.field}>
                <span>{label}</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  aria-label={label}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) upload.mutate({ file, kind });
                  }}
                />
              </label>
            );
          })}
          <p className={styles.muted}>上傳前會在瀏覽器自動遮蔽人臉，原圖不會送到後端。</p>
        </details>

        <details open aria-label="畫格">
          <summary>畫格</summary>
          <label className={styles.inline}>
            <input type="checkbox" checked={draft.keyframesEnabled} onChange={(event) => setDraft({ ...draft, keyframesEnabled: event.target.checked })} />
            開啟中間關鍵畫格
          </label>
          {draft.keyframesEnabled && (
            <>
              <TextField label="關鍵畫格時間點" value={timesText} onChange={setTimesText} placeholder="以「、」分開，例如 3、6" />
              {keyframeError && (
                <p className={styles.error} role="alert">
                  {keyframeError}
                </p>
              )}
              <Button onClick={() => setTimesText(suggestKeyframeTimes({ durationSec: draft.durationSec, keyframeTimes: shot.keyframeTimes }).join('、'))}>建議時間點</Button>
              <p>{detail.keyframeControl}</p>
              <p className={styles.muted}>{KEYFRAME_REMINDER}</p>
            </>
          )}
          {shot.keyframesEnabled && (
            <Button
              disabled={consent.busy}
              onClick={() => paid(shot.keyframeTimes.length + (detail.last ? 0 : 1), '同意並產生', (token) => generateShotKeyframes(videoId, shot.shotKey, token))}
            >
              產生關鍵畫格
            </Button>
          )}
          <fieldset className={styles.region} aria-labelledby={ids.region}>
            <legend id={ids.region}>圈選範圍</legend>
            {(['left', 'top', 'width', 'height'] as const).map((side) => (
              <label key={side}>
                {`${{ left: '左', top: '上', width: '寬', height: '高' }[side]}（%）`}
                <input type="number" min={0} max={100} value={box[side]} onChange={(event) => setBox({ ...box, [side]: Number(event.target.value) })} />
              </label>
            ))}
          </fieldset>
          <TextField label="要怎麼改這一處" value={instruction} onChange={setInstruction} labelAccessory={regionAssist.button} />
          {regionAssist.panel}
          <Button
            disabled={!detail.first?.assetId || !instruction.trim() || consent.busy}
            onClick={() =>
              paid(1, '同意並修改', (token) =>
                editShotRegion(videoId, shot.shotKey, detail.first?.id ?? '', { box: percentBox(box), instruction: instruction.trim(), ...(token ? { consentToken: token } : {}) }),
              )
            }
          >
            修改這一處
          </Button>
        </details>

        <details open aria-label="生成設定">
          <summary>生成設定</summary>
          <label className={styles.inline}>
            <input type="checkbox" checked={draft.nativeVoice} onChange={(event) => setDraft({ ...draft, nativeVoice: event.target.checked })} />
            使用模型原生語音
          </label>
          <p className={styles.muted}>關掉時影片裡的人不開口說台詞，台詞只出現在字幕。</p>
          <Select
            label="一次產生幾張候選圖"
            value={String(draft.candidateCount)}
            options={Array.from({ length: MAX_CANDIDATES }, (_, index) => String(index + 1))}
            labels={Object.fromEntries(Array.from({ length: MAX_CANDIDATES }, (_, index) => [String(index + 1), `${index + 1} 張`]))}
            onChange={(value) => setDraft({ ...draft, candidateCount: Number(value) })}
          />
          <p className={styles.muted}>{`模型沿用這支影片的設定（${video.data ? videoModelLabel(video.data.video.videoModel) : '讀取中'}），不能在這裡更換。`}</p>
        </details>

        <details open aria-label="進階：生成指令">
          <summary>進階：生成指令</summary>
          {shot.customPrompt && <Tag tone="info">此格使用自訂指令</Tag>}
          <label className={styles.field}>
            <span>目前的生成指令</span>
            <textarea aria-label="目前的生成指令" readOnly rows={4} value={detail.lastPrompt ?? ''} />
          </label>
          <TextField label="自訂生成指令" multiline value={customPrompt} onChange={setCustomPrompt} placeholder="只影響這一格；留白時照節點的生成指令" />
          <Button disabled={saveCustom.isPending} onClick={() => saveCustom.mutate()}>
            儲存自訂指令
          </Button>
        </details>

        <details open aria-label="版本">
          <summary>版本</summary>
          <ul className={styles.versions}>
            {detail.versions.map((version) => (
              <li key={version.id}>
                <span>{names.get(version.id)}</span>
                {version.editOfFrameId && <Tag tone="info">限定範圍修改</Tag>}
                {version.userUploaded && <Tag tone="info">使用者上傳</Tag>}
                {currentIds.has(version.id) ? (
                  <Tag tone="success">目前使用</Tag>
                ) : (
                  version.state === 'ready' && (
                    <Button disabled={select.isPending} onClick={() => select.mutate(version.id)}>
                      {`選回這一張：${names.get(version.id) ?? ''}`}
                    </Button>
                  )
                )}
              </li>
            ))}
          </ul>
        </details>

        {(save.isError || consent.error || upload.isError || select.isError || saveCustom.isError) && (
          <p className={styles.error} role="alert">
            {consent.error ?? errorText(save.error ?? upload.error ?? select.error ?? saveCustom.error)}
          </p>
        )}
        <div className={styles.actions}>
          <Button variant="primary" disabled={!dirty || Boolean(keyframeError) || save.isPending} onClick={() => save.mutate()}>
            儲存這一格
          </Button>
          <Button disabled={consent.busy} onClick={() => paid(shot.candidateCount ?? 1, '同意並重生', (token) => regenerateFrame(videoId, shot.shotKey, token))}>
            重生這一格
          </Button>
          <Button onClick={() => navigate(`/videos/${videoId}/studio?panel=${from}`)}>完成這一格</Button>
        </div>
        {consent.dialog}
      </section>
    </main>
  );
}

function errorText(error: unknown): string {
  return error instanceof ApiRequestError ? error.message : error instanceof Error ? error.message : '請再試一次';
}

function FrameFigure({ name, frame, caption, uploaded }: { name: string; frame: Frame | null; caption?: string | undefined; uploaded?: boolean | undefined }) {
  return (
    <figure className={styles.figure} aria-label={name}>
      {frame?.assetId ? <img src={`/api/assets/${frame.assetId}`} alt={name} /> : <div className={styles.empty} aria-hidden="true" />}
      <figcaption>
        <span>{name}</span>
        {caption && <span>{caption}</span>}
        {frame ? frameTags({ ...frame, userUploaded: uploaded ?? false }).map((tag) => <Tag key={tag}>{tag}</Tag>) : <Tag>還沒產生</Tag>}
      </figcaption>
    </figure>
  );
}

function Select({ label, value, options, labels, onChange }: { label: string; value: string; options: string[]; labels?: Record<string, string>; onChange: (value: string) => void }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {labels?.[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}
