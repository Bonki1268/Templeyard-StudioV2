import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CHARACTER_STATE_LABELS,
  MAX_CONTINUITY_LOCKS,
  composeDescription,
  creditsText,
  parseLocks,
  splitDescription,
  versionButtonLabel,
  videoEntryPath,
  videoStatus,
  type CharacterPart,
  type LibraryCharacter,
} from '@templeyard/shared';
import { ChevronLeft, Plus, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  ApiRequestError,
  assetUrl,
  confirmCharacter,
  fetchCharacterUsage,
  fetchCharacterVersions,
  fetchLibraryCharacters,
  generateCharacter,
  patchCharacter,
  postCostEstimate,
} from '../../api/client';
import { Button } from '../../components/Button';
import { Tag } from '../../components/Tag';
import { TextField } from '../../components/TextField';
import { useAiAssist } from '../../features/assist/useAiAssist';
import { useCostConsent } from '../../features/costs/useCostConsent';
import { seriesVideosKey } from '../../features/series/SeriesCard';
import { seriesLibraryKey, useSeriesPage } from './SeriesShell';
import detail from './CharacterDetail.module.css';
import styles from './SeriesPages.module.css';

// 角色詳情（docs/03-App-Flow.md「角色詳情」、設計稿 CharacterDetail）

type LockRow = { key: number; value: string };

let nextKey = 1;
const toRows = (locks: readonly string[]): LockRow[] => locks.map((value) => ({ key: nextKey++, value }));

function formatConfirmed(iso: string): string {
  return iso.slice(0, 10);
}

function Detail({ character }: { character: LibraryCharacter }) {
  const { series } = useSeriesPage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sheetId = useId();
  const usedId = useId();
  const looksId = useId();
  const locksId = useId();
  const current = character.version;
  const split = splitDescription(current);
  const [anchors, setAnchors] = useState(split.identityAnchors);
  const [look, setLook] = useState(split.look);
  const [rows, setRows] = useState<LockRow[]>(() => toRows(current.continuityLocks));
  const [viewing, setViewing] = useState<number | null>(null);

  const versions = useQuery({ queryKey: ['character-versions', character.id, current.id], queryFn: () => fetchCharacterVersions(character.id) });
  const usage = useQuery({ queryKey: ['character-usage', character.id], queryFn: () => fetchCharacterUsage(character.id) });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: seriesLibraryKey(series.id) });
    await queryClient.invalidateQueries({ queryKey: ['character-versions', character.id] });
    await queryClient.invalidateQueries({ queryKey: seriesVideosKey(series.id) });
  };
  useEffect(() => {
    if (character.state !== 'generating') return;
    const timer = setInterval(() => void refresh(), 1000);
    return () => clearInterval(timer);
  });

  const locks = rows.map((row) => row.value.trim()).filter(Boolean);
  const changed =
    anchors.trim() !== split.identityAnchors.trim() || look.trim() !== split.look.trim() || locks.join('\n') !== current.continuityLocks.join('\n');
  const confirmed = character.state === 'confirmed';
  const nextVersion = current.version + 1;
  const descriptionText = composeDescription(anchors, look);

  const scope = character.videoId ? character.videoId : { seriesId: series.id };
  const consent = useCostConsent(scope);
  const action = useMutation({ mutationFn: async (run: () => Promise<unknown>) => run(), onSettled: refresh });
  const imageModel = current.imageModel;
  const estimate = useQuery({
    queryKey: ['character-estimate', character.id, imageModel],
    queryFn: () => postCostEstimate(scope, [{ model: imageModel, units: 2 }]),
    staleTime: 60_000,
  });

  const descriptionAssist = useAiAssist({
    field: 'character.description',
    fieldLabel: '造型',
    ...(character.videoId ? { videoId: character.videoId } : { seriesId: series.id }),
    target: { characterId: character.id },
    userInput: () => descriptionText,
    onAdopt: setLook,
  });
  const locksAssist = useAiAssist({
    field: 'character.locks',
    fieldLabel: '連續性鎖',
    ...(character.videoId ? { videoId: character.videoId } : { seriesId: series.id }),
    target: { characterId: character.id },
    userInput: () => descriptionText,
    onAdopt: (text) => setRows(toRows(parseLocks(text).slice(0, MAX_CONTINUITY_LOCKS))),
  });

  const saveBody = { identityAnchors: anchors, look, continuityLocks: locks };
  const busy = action.isPending || consent.busy || character.state === 'generating';
  const viewVersion = versions.data?.find((v) => v.version === (viewing ?? current.version)) ?? current;
  const isCurrent = viewVersion.version === current.version;

  function generate(part?: CharacterPart) {
    void consent.ask({
      items: [{ model: imageModel, units: part ? 1 : 2 }],
      confirmLabel: '同意並產生',
      run: async (token) => {
        if (changed && !confirmed) await patchCharacter(character.id, saveBody);
        await generateCharacter(character.id, character.videoId, token, part);
        await refresh();
      },
    });
  }

  function saveAsNewVersion() {
    void consent.ask({
      items: [{ model: imageModel, units: 2 }],
      confirmLabel: '同意並產生',
      run: async (token) => {
        await patchCharacter(character.id, saveBody);
        await generateCharacter(character.id, character.videoId, token);
        await refresh();
      },
    });
  }

  const hasImages = Boolean(current.sheetAssetId || current.lookAssetId);
  const stateLabel = CHARACTER_STATE_LABELS[character.state];
  const note = viewVersion.changeNote ?? (viewVersion.confirmedAt ? `v${viewVersion.version} 於 ${formatConfirmed(viewVersion.confirmedAt)} 確認。` : `v${viewVersion.version} 還沒有確認。`);
  const versionNote = viewVersion.changeNote && viewVersion.confirmedAt ? `v${viewVersion.version} 於 ${formatConfirmed(viewVersion.confirmedAt)} 確認。${viewVersion.changeNote}` : note;
  const bar = !changed ? '沒有修改' : confirmed ? `修改外觀或連續性鎖會另存為 v${nextVersion}，並重新產生三視圖與定裝圖` : '有未儲存的修改';
  const error = consent.error ?? (action.isError ? (action.error instanceof ApiRequestError ? action.error.message : '請再試一次') : null);

  return (
    <>
      <div role="banner" aria-label="角色" className={detail.head}>
        <Link className={detail.back} to={`/series/${series.id}/characters`}>
          <ChevronLeft size={18} strokeWidth={1.8} aria-hidden="true" />
          回到角色庫
        </Link>
        <div className={detail.titleRow}>
          <h1 className={detail.title}>{character.name}</h1>
          <Tag>{character.isSeries ? '系列角色' : '影片專屬'}</Tag>
          <Tag tone={character.state === 'confirmed' ? 'success' : character.state === 'failed' ? 'error' : 'warning'}>{`v${current.version} ${stateLabel}`}</Tag>
        </div>
      </div>

      <main className={detail.layout}>
        <div className={detail.column}>
          <section className={detail.card} aria-labelledby={sheetId}>
            <div className={detail.cardHead}>
              <h2 id={sheetId} className={detail.cardTitle}>
                定裝版
              </h2>
              <div role="group" aria-label="選擇版本" className={detail.versions}>
                {(versions.data ?? [current]).map((v) => (
                  <button key={v.id} type="button" className={detail.versionButton} aria-pressed={v.version === viewVersion.version} onClick={() => setViewing(v.version)}>
                    {versionButtonLabel(v.version, current.version)}
                  </button>
                ))}
              </div>
            </div>
            <div className={detail.sheet}>
              {viewVersion.sheetAssetId ? (
                <img src={assetUrl(viewVersion.sheetAssetId)} alt={`${character.name} 三視圖 v${viewVersion.version}`} />
              ) : (
                <div role="img" aria-label={`${character.name} 三視圖 v${viewVersion.version}`}>
                  三視圖（正面・側面・背面）還沒產生
                </div>
              )}
            </div>
            <div className={detail.lookRow}>
              <div className={detail.look}>
                {viewVersion.lookAssetId ? (
                  <img src={assetUrl(viewVersion.lookAssetId)} alt={`${character.name} 定裝圖 v${viewVersion.version}`} />
                ) : (
                  <div role="img" aria-label={`${character.name} 定裝圖 v${viewVersion.version}`}>
                    定裝圖還沒產生
                  </div>
                )}
              </div>
              <div className={detail.side}>
                <p role="note" className={detail.note}>
                  {versionNote}
                </p>
                {character.state === 'generating' && (
                  <p role="status" className={styles.hint}>
                    生成中：正在產生三視圖與定裝圖…
                  </p>
                )}
                {character.error && <p className={styles.error}>{character.error}</p>}
                <div className={detail.buttons}>
                  {!hasImages && isCurrent && (
                    <Button variant="primary" disabled={busy || !descriptionText} onClick={() => generate()}>
                      產生三視圖與定裝圖
                    </Button>
                  )}
                  <Button disabled={busy || changed || !isCurrent || !descriptionText} onClick={() => generate('sheet')}>
                    重生三視圖
                  </Button>
                  <Button disabled={busy || changed || !isCurrent || !descriptionText} onClick={() => generate('look')}>
                    重生定裝圖
                  </Button>
                  {character.state === 'pending_confirm' && isCurrent && !changed && (
                    <Button variant="primary" disabled={busy} onClick={() => action.mutate(() => confirmCharacter(character.id))}>
                      確認這個版本
                    </Button>
                  )}
                </div>
                <p className={styles.hint}>{`每次重生約 ${creditsText(estimate.data ? estimate.data.estimate.credits : null)}`}</p>
              </div>
            </div>
          </section>

          <section className={detail.card} aria-labelledby={usedId}>
            <h2 id={usedId} className={detail.cardTitle}>
              用到這個角色的影片
            </h2>
            {usage.isSuccess && usage.data.length === 0 && <p className={styles.hint}>還沒有影片用到這個角色。</p>}
            <ul className={detail.usedList}>
              {(usage.data ?? []).map((video) => (
                <li key={video.id} className={detail.usedRow}>
                  <Link to={videoEntryPath(video)}>{video.title}</Link>
                  <Tag>{`使用 v${video.version}`}</Tag>
                  <span className={styles.hint}>{videoStatus({ stage: video.stage, staleFrames: 0, staleClips: 0 }).label}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className={detail.column}>
          <section className={detail.card} aria-labelledby={looksId}>
            <h2 id={looksId} className={detail.cardTitle}>
              外觀
            </h2>
            <TextField label="角色名稱" value={character.name} onChange={() => undefined} disabled />
            <TextField
              label="身份錨點"
              multiline
              value={anchors}
              maxLength={250}
              onChange={setAnchors}
              labelAccessory={<span className={styles.hint}>換了衣服仍認得出的特徵</span>}
            />
            <TextField label="造型" multiline value={look} maxLength={250} onChange={setLook} labelAccessory={descriptionAssist.button} />
            {descriptionAssist.panel}
          </section>

          <section className={detail.card} aria-labelledby={locksId}>
            <div className={detail.cardHead}>
              <h2 id={locksId} className={detail.cardTitle}>
                連續性鎖
              </h2>
              {locksAssist.button}
            </div>
            {locksAssist.panel}
            <p className={styles.text}>跨鏡頭不會改變、一眼看得出不一致的東西，各寫成一條英文片語。系統會逐字帶進每一格的精緻圖、關鍵畫格與影片指令。</p>
            {rows.map((row, index) => (
              <div key={row.key} className={detail.lockRow}>
                <label htmlFor={`${locksId}-${row.key}`} className={styles.srOnly}>{`連續性鎖 ${index + 1}`}</label>
                <input
                  id={`${locksId}-${row.key}`}
                  className={detail.lockInput}
                  value={row.value}
                  maxLength={80}
                  onChange={(event) => setRows((list) => list.map((r) => (r.key === row.key ? { ...r, value: event.target.value } : r)))}
                />
                <button
                  type="button"
                  className={detail.removeButton}
                  aria-label={`移除連續性鎖：${row.value}`}
                  onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))}
                >
                  <X size={18} strokeWidth={1.8} aria-hidden="true" />
                </button>
              </div>
            ))}
            <div>
              <Button disabled={rows.length >= MAX_CONTINUITY_LOCKS} onClick={() => setRows((list) => [...list, ...toRows([''])])}>
                <Plus size={16} strokeWidth={2} aria-hidden="true" /> 新增一條
              </Button>
            </div>
            {rows.length >= MAX_CONTINUITY_LOCKS && <p className={styles.hint}>{`連續性鎖最多 ${MAX_CONTINUITY_LOCKS} 條`}</p>}
            <p className={styles.hint}>寫法：顏色＋材質或形制＋物體，不寫動作、姿勢或劇情。一個角色通常 1～3 條。</p>
          </section>
        </div>
      </main>

      {error && (
        <p className={detail.errorLine} role="alert">
          {error}
        </p>
      )}
      <section className={detail.bar} aria-label="操作列">
        <div className={detail.barInner}>
          <div className={detail.barText}>
            <p className={detail.barMessage}>{bar}</p>
            {confirmed && changed && <span className={styles.hint}>{`預估：${creditsText(estimate.data ? estimate.data.estimate.credits : null)}`}</span>}
          </div>
          <div className={detail.buttons}>
            <Button onClick={() => void navigate(`/series/${series.id}/characters`)}>取消</Button>
            {confirmed ? (
              <Button variant="primary" disabled={busy || !changed || !descriptionText} onClick={saveAsNewVersion}>
                {`另存為 v${nextVersion} 並產生定裝圖`}
              </Button>
            ) : (
              <Button variant="primary" disabled={busy || !changed || !descriptionText} onClick={() => action.mutate(() => patchCharacter(character.id, saveBody))}>
                儲存修改
              </Button>
            )}
          </div>
        </div>
      </section>
      {consent.dialog}
    </>
  );
}

export function CharacterDetailPage() {
  const { series } = useSeriesPage();
  const { cid = '' } = useParams();
  const library = useQuery({
    queryKey: seriesLibraryKey(series.id),
    queryFn: () => fetchLibraryCharacters(series.id),
  });
  const character = library.data?.find((c) => c.id === cid);
  return (
    <>
      {library.isPending && (
        <p className={styles.notice} role="status">
          正在讀取角色…
        </p>
      )}
      {library.isError && (
        <p className={styles.errorBox} role="alert">
          讀不到角色：{library.error.message}
        </p>
      )}
      {library.isSuccess && !character && (
        <div className={styles.notFound}>
          <p role="alert" className={styles.errorBox}>
            找不到這個角色
          </p>
          <Link to={`/series/${series.id}/characters`}>回到角色庫</Link>
        </div>
      )}
      {/* 換了版本或儲存後，用最新內容重建欄位 */}
      {character && <Detail key={`${character.version.id}-${character.version.description}-${character.version.continuityLocks.join('\n')}`} character={character} />}
    </>
  );
}
