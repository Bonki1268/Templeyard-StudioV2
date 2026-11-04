import { parseLocks } from '@templeyard/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { ApiRequestError, fetchSeriesCharacters, postSeriesCharacter } from '../../api/client';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { CharacterCard } from '../plan/CharacterCard';
import planStyles from '../plan/PlanPanel.module.css';
import styles from './SeriesCharacterLibrary.module.css';

export function seriesCharactersKey(seriesId: string) {
  return ['series-characters', seriesId] as const;
}

/**
 * 系列設定的角色庫（使用者 2026-11-05 提出）：列出系列角色，新增、修改，
 * 用系列的預設圖片模型產生三視圖與定裝圖並確認；同系列的影片都能沿用
 */
export function SeriesCharacterLibrary({ seriesId }: { seriesId: string }) {
  const titleId = useId();
  const queryClient = useQueryClient();
  const key = seriesCharactersKey(seriesId);
  const characters = useQuery({
    queryKey: key,
    queryFn: () => fetchSeriesCharacters(seriesId),
    refetchInterval: (query) => (query.state.data?.some((c) => c.state === 'generating') ? 1000 : false),
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: key });
    // 首頁卡片的共同角色標籤
    await queryClient.invalidateQueries({ queryKey: ['series-videos', seriesId] });
  };

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [locks, setLocks] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const create = useMutation({
    mutationFn: () => postSeriesCharacter(seriesId, { name, description, continuityLocks: parseLocks(locks) }),
    onSuccess: async () => {
      setName('');
      setDescription('');
      setLocks('');
      setFieldErrors({});
      await refresh();
    },
    onError: (error) => setFieldErrors(error instanceof ApiRequestError ? error.fieldErrors : {}),
  });
  const canCreate = Boolean(name.trim() && description.trim()) && !create.isPending;
  const createError = create.isError && Object.keys(fieldErrors).length === 0 ? create.error.message : undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (canCreate) create.mutate();
  };

  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        角色庫
      </h2>
      <p className={styles.muted}>系列角色同系列的每支影片都能沿用。產生定裝圖使用系列的預設圖片模型。</p>

      {characters.isPending && (
        <p className={styles.muted} role="status">
          正在讀取角色…
        </p>
      )}
      {characters.isError && (
        <p className={styles.error} role="alert">
          讀不到角色：{characters.error.message}
        </p>
      )}
      {characters.isSuccess && characters.data.length === 0 && <p className={styles.muted}>還沒有系列角色。</p>}
      {characters.isSuccess && characters.data.length > 0 && (
        <div className={planStyles.characters}>
          {characters.data.map((character) => (
            <CharacterCard key={`${character.id}-${character.version.id}`} seriesId={seriesId} character={character} onChanged={refresh} />
          ))}
        </div>
      )}

      <form className={styles.form} aria-label="新增系列角色" onSubmit={submit} noValidate>
        <TextField label="新角色名稱" value={name} maxLength={20} onChange={setName} error={fieldErrors.name} />
        <TextField label="新角色的外觀描述" multiline value={description} maxLength={500} onChange={setDescription} error={fieldErrors.description} />
        <TextField
          label="新角色的連續性鎖"
          multiline
          value={locks}
          placeholder="一行一條英文片語，例如 crimson silk embroidered vest"
          onChange={setLocks}
          error={fieldErrors.continuityLocks}
        />
        {createError && (
          <p className={styles.error} role="alert">
            {createError}
          </p>
        )}
        <div>
          <Button type="submit" disabled={!canCreate} aria-busy={create.isPending || undefined}>
            新增角色
          </Button>
        </div>
      </form>
    </section>
  );
}
