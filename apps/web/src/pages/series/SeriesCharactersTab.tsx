import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CHARACTER_SCOPE_LABELS,
  characterScopeCounts,
  filterCharacters,
  libraryStatusLabel,
  type CharacterScope,
  type LibraryCharacter,
} from '@templeyard/shared';
import { Plus, UserRound } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { ApiRequestError, assetUrl, fetchLibraryCharacters, setSeriesCharacter } from '../../api/client';
import { Button } from '../../components/Button';
import { Tag } from '../../components/Tag';
import { FilterButtons } from '../../features/series/FilterButtons';
import { seriesVideosKey } from '../../features/series/SeriesCard';
import { NewCharacterDialog } from './NewCharacterDialog';
import { seriesLibraryKey, useSeriesPage } from './SeriesShell';
import styles from './SeriesPages.module.css';

// 角色庫分頁（docs/03-App-Flow.md「角色庫分頁」、設計稿 Characters）

function statusTone(label: string): 'success' | 'warning' | 'error' | 'neutral' {
  if (label === '已確認') return 'success';
  if (label === '生成失敗') return 'error';
  return 'warning';
}

function Picture({ assetId, alt, children }: { assetId: string | null; alt: string; children: string }) {
  return (
    <div className={styles.thumb}>
      {assetId ? (
        <img src={assetUrl(assetId)} alt={alt} />
      ) : (
        <div role="img" aria-label={alt} style={{ display: 'grid', justifyItems: 'center', gap: 6 }}>
          <UserRound size={28} strokeWidth={1.6} aria-hidden="true" />
          <span>{children}</span>
        </div>
      )}
    </div>
  );
}

function CharacterCardItem({ character, onPromote, promoting }: { character: LibraryCharacter; onPromote: () => void; promoting: boolean }) {
  const { version } = character;
  const status = libraryStatusLabel(character);
  const promoteHint = useId();
  const canPromote = character.state === 'confirmed';
  return (
    <li>
      <article className={styles.card} aria-label={`角色：${character.name}`}>
        <div className={styles.thumbs}>
          <Picture assetId={version.sheetAssetId} alt={`${character.name} 三視圖 v${version.version}`}>{`三視圖 v${version.version}`}</Picture>
          <Picture assetId={version.lookAssetId} alt={`${character.name} 定裝圖 v${version.version}`}>
            定裝圖
          </Picture>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>{character.name}</h2>
            <Tag tone={character.isSeries ? 'neutral' : 'info'}>{character.isSeries ? '系列角色' : '影片專屬'}</Tag>
            <Tag tone={statusTone(status)}>{status}</Tag>
          </div>
          <p className={styles.text}>{version.description}</p>
          {version.continuityLocks.length > 0 && (
            <div>
              <span className={styles.locksLabel}>連續性鎖</span>
              <div className={styles.locks}>
                {version.continuityLocks.map((lock) => (
                  <code key={lock} className={styles.code}>
                    {lock}
                  </code>
                ))}
              </div>
            </div>
          )}
          <p className={styles.meta}>{`出現在 ${character.videoCount} 支影片・目前 v${version.version}`}</p>
          <div className={styles.cardActions}>
            <Link className={styles.cardLink} to={`/series/${character.seriesId ?? ''}/characters/${character.id}`} aria-label={`查看與修改：${character.name}`}>
              查看與修改
            </Link>
            {!character.isSeries && (
              <Button aria-label={`設為系列角色：${character.name}`} aria-describedby={canPromote ? undefined : promoteHint} disabled={!canPromote || promoting} onClick={onPromote}>
                設為系列角色
              </Button>
            )}
          </div>
          {!character.isSeries && !canPromote && (
            <p id={promoteHint} className={styles.hint}>
              請先確認定裝圖，才能設為系列角色
            </p>
          )}
        </div>
      </article>
    </li>
  );
}

export function SeriesCharactersTab() {
  const { series } = useSeriesPage();
  const queryClient = useQueryClient();
  const searchId = useId();
  const [scope, setScope] = useState<CharacterScope>('all');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const key = seriesLibraryKey(series.id);
  const library = useQuery({
    queryKey: key,
    queryFn: () => fetchLibraryCharacters(series.id),
    refetchInterval: (state) => (state.state.data?.some((c) => c.state === 'generating') ? 1000 : false),
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: key });
    // 首頁卡片的共同角色標籤
    await queryClient.invalidateQueries({ queryKey: seriesVideosKey(series.id) });
  };
  const promote = useMutation({ mutationFn: setSeriesCharacter, onSettled: refresh });

  const all = library.data ?? [];
  const counts = characterScopeCounts(all);
  // 目前有卡片的 seriesId：影片專屬角色沒有 seriesId，連結用這個系列的
  const shown = filterCharacters(all, { scope, query }).map((c) => ({ ...c, seriesId: c.seriesId ?? series.id }));

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.search}>
          <label htmlFor={searchId} className={styles.srOnly}>
            搜尋角色
          </label>
          <input id={searchId} type="search" value={query} placeholder="搜尋角色名稱或描述" onChange={(event) => setQuery(event.target.value)} />
        </div>
        <FilterButtons
          label="篩選角色"
          value={scope}
          onChange={setScope}
          options={(['all', 'series', 'video'] as const).map((value) => ({ value, label: CHARACTER_SCOPE_LABELS[value], count: counts[value] }))}
        />
        <div className={styles.spacer} />
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus size={18} strokeWidth={2} aria-hidden="true" /> 新增角色
        </Button>
      </div>

      <p className={styles.infoBox}>
        系列角色可以在這個系列的任何影片直接沿用。角色的連續性鎖會逐字帶進每一格的生成指令；修改角色會另存新版本，正在製作的影片改用新版本時，相關畫面會標示「需重新確認」。
      </p>

      {library.isPending && (
        <p className={styles.hint} role="status">
          正在讀取角色…
        </p>
      )}
      {library.isError && (
        <p className={styles.error} role="alert">
          讀不到角色：{library.error.message}
        </p>
      )}
      {promote.isError && (
        <p className={styles.error} role="alert">
          {promote.error instanceof ApiRequestError ? promote.error.message : '設為系列角色失敗，請再試一次'}
        </p>
      )}
      <section aria-label="角色庫">
        {library.isSuccess && all.length === 0 && <p className={styles.emptyBox}>還沒有角色。按「新增角色」建立第一位。</p>}
        {library.isSuccess && all.length > 0 && shown.length === 0 && <p className={styles.emptyBox}>這個篩選條件下沒有角色。</p>}
        {shown.length > 0 && (
          <ul className={styles.grid}>
            {shown.map((character) => (
              <CharacterCardItem key={character.id} character={character} promoting={promote.isPending} onPromote={() => promote.mutate(character.id)} />
            ))}
          </ul>
        )}
      </section>

      {creating && <NewCharacterDialog seriesId={series.id} onClose={() => setCreating(false)} onCreated={refresh} />}
    </>
  );
}
