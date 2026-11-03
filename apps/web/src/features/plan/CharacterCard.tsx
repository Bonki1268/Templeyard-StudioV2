import { useMutation } from '@tanstack/react-query';
import { characterTags, parseLocks, type Character } from '@templeyard/shared';
import { useState } from 'react';
import { ApiRequestError, confirmCharacter, generateCharacter, patchCharacter, setSeriesCharacter } from '../../api/client';
import { Button } from '../../components/Button';
import { Tag } from '../../components/Tag';
import { useAiAssist } from '../assist/useAiAssist';
import { useCostConsent } from '../costs/useCostConsent';
import styles from './PlanPanel.module.css';

type CharacterCardProps = { videoId: string; character: Character; onChanged: () => Promise<void> };

/** 角色卡：外觀描述與連續性鎖（可用 AI 幫我寫）、產生三視圖與定裝圖、確認、設為系列角色 */
export function CharacterCard({ videoId, character, onChanged }: CharacterCardProps) {
  const name = character.name;
  const [description, setDescription] = useState(character.version.description);
  const [locks, setLocks] = useState(character.version.continuityLocks.join('\n'));
  const consent = useCostConsent(videoId);
  const descriptionAssist = useAiAssist({
    field: 'character.description',
    fieldLabel: `${name}的外觀描述`,
    videoId,
    target: { characterId: character.id },
    userInput: () => description,
    onAdopt: setDescription,
  });
  const locksAssist = useAiAssist({
    field: 'character.locks',
    fieldLabel: `${name}的連續性鎖`,
    videoId,
    target: { characterId: character.id },
    userInput: () => description,
    onAdopt: setLocks,
  });

  const action = useMutation({
    mutationFn: async (run: () => Promise<unknown>) => run(),
    onSettled: onChanged,
  });
  const busy = action.isPending || consent.busy || character.state === 'generating';
  const changed = description !== character.version.description || parseLocks(locks).join('\n') !== character.version.continuityLocks.join('\n');

  function generate() {
    void consent.ask({
      items: [{ model: character.version.imageModel, units: 2 }],
      confirmLabel: '同意並產生',
      run: async (consentToken) => {
        // 先存下還沒存的修改，再用最新的外觀描述產生
        if (changed) await patchCharacter(character.id, { description, continuityLocks: parseLocks(locks) });
        await generateCharacter(character.id, videoId, consentToken);
        await onChanged();
      },
    });
  }

  return (
    <article className={styles.character} aria-label={`角色：${name}`}>
      <div className={styles.cardHead}>
        <h4 className={styles.characterName}>{name}</h4>
        <div className={styles.tags}>
          {characterTags(character).map((tag) => (
            <Tag key={tag} tone={tag === '已確認' ? 'success' : tag === '生成失敗' ? 'error' : tag === '系列角色' ? 'info' : 'warning'}>
              {tag}
            </Tag>
          ))}
        </div>
      </div>
      {character.error && <p className={styles.error}>{character.error}</p>}

      <div className={styles.field}>
        <span className={styles.labelRow}>
          <span>{`${name}的外觀描述`}</span>
          {descriptionAssist.button}
        </span>
        <textarea aria-label={`${name}的外觀描述`} rows={2} value={description} disabled={busy} onChange={(event) => setDescription(event.target.value)} />
      </div>
      {descriptionAssist.panel}
      <div className={styles.field}>
        <span className={styles.labelRow}>
          <span>{`${name}的連續性鎖`}</span>
          {locksAssist.button}
        </span>
        <textarea aria-label={`${name}的連續性鎖`} rows={2} value={locks} disabled={busy} placeholder="一行一條英文片語，例如 crimson silk embroidered vest" onChange={(event) => setLocks(event.target.value)} />
      </div>
      {locksAssist.panel}

      {(character.version.sheetAssetId || character.version.lookAssetId) && (
        <div className={styles.images}>
          {character.version.sheetAssetId && <img src={`/api/assets/${character.version.sheetAssetId}`} alt={`${name}三視圖`} />}
          {character.version.lookAssetId && <img src={`/api/assets/${character.version.lookAssetId}`} alt={`${name}定裝圖`} />}
        </div>
      )}

      <div className={styles.cardActions}>
        <Button
          disabled={busy || !changed}
          onClick={() => action.mutate(() => patchCharacter(character.id, { description, continuityLocks: parseLocks(locks) }))}
        >
          {`儲存角色：${name}`}
        </Button>
        {character.state !== 'confirmed' && (
          <Button disabled={busy || !description.trim()} onClick={generate}>
            {`產生定裝圖：${name}`}
          </Button>
        )}
        {character.state === 'pending_confirm' && !changed && (
          <Button variant="primary" disabled={busy} onClick={() => action.mutate(() => confirmCharacter(character.id))}>
            {`確認角色：${name}`}
          </Button>
        )}
        {character.state === 'confirmed' && !character.isSeries && (
          <Button disabled={busy} onClick={() => action.mutate(() => setSeriesCharacter(character.id))}>
            {`設為系列角色：${name}`}
          </Button>
        )}
      </div>
      {(action.isError || consent.error) && (
        <p className={styles.error} role="alert">
          {consent.error ?? (action.error instanceof ApiRequestError ? action.error.message : '請再試一次')}
        </p>
      )}
      {consent.dialog}
    </article>
  );
}
