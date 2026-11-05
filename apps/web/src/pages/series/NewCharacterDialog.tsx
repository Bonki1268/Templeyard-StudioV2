import { useMutation } from '@tanstack/react-query';
import { parseLocks } from '@templeyard/shared';
import { useState, type FormEvent } from 'react';
import { ApiRequestError, postSeriesCharacter } from '../../api/client';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { useDialog } from '../../components/useDialog';
import { useAiAssist } from '../../features/assist/useAiAssist';
import { barMessage } from '../../features/series/settingsForm';
import styles from './NewCharacterDialog.module.css';

// 新增系列角色（角色庫分頁，設計稿 Characters）：名稱、外觀描述、連續性鎖；外觀描述與連續性鎖都可 AI 幫我寫

export function NewCharacterDialog({ seriesId, onClose, onCreated }: { seriesId: string; onClose: () => void; onCreated: () => Promise<void> }) {
  const { ref, titleId } = useDialog(onClose);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [locks, setLocks] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const create = useMutation({
    mutationFn: () => postSeriesCharacter(seriesId, { name, description, continuityLocks: parseLocks(locks) }),
    onSuccess: async () => {
      await onCreated();
      onClose();
    },
    onError: (error) => setFieldErrors(error instanceof ApiRequestError ? error.fieldErrors : {}),
  });
  // 角色還沒建立：AI 幫我寫帶輸入的名稱與目前的描述
  const newTarget = name.trim() ? { characterName: name.trim() } : {};
  const descriptionAssist = useAiAssist({
    field: 'character.description',
    fieldLabel: '新角色的外觀描述',
    seriesId,
    target: newTarget,
    userInput: () => description,
    onAdopt: setDescription,
  });
  const locksAssist = useAiAssist({
    field: 'character.locks',
    fieldLabel: '新角色的連續性鎖',
    seriesId,
    target: newTarget,
    userInput: () => description,
    onAdopt: setLocks,
  });
  const pending = [...(name.trim() ? [] : ['角色名稱']), ...(description.trim() ? [] : ['外觀描述'])];
  const canCreate = pending.length === 0 && !create.isPending;
  const createError = create.isError && Object.keys(fieldErrors).length === 0 ? create.error.message : undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (canCreate) create.mutate();
  };

  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby={titleId}>
      <form onSubmit={submit} noValidate className={styles.form}>
        <h2 id={titleId} className={styles.title}>
          新增角色
        </h2>
        <p className={styles.intro}>建立後屬於這個系列，同系列的每支影片都能沿用。</p>
        <TextField label="新角色名稱" value={name} maxLength={20} onChange={setName} error={fieldErrors.name} />
        <TextField
          label="新角色的外觀描述"
          multiline
          value={description}
          maxLength={500}
          onChange={setDescription}
          error={fieldErrors.description}
          labelAccessory={descriptionAssist.button}
        />
        {descriptionAssist.panel}
        <TextField
          label="新角色的連續性鎖"
          multiline
          value={locks}
          placeholder="一行一條英文片語，例如 crimson silk embroidered vest"
          onChange={setLocks}
          error={fieldErrors.continuityLocks}
          labelAccessory={locksAssist.button}
        />
        {locksAssist.panel}
        {createError && (
          <p className={styles.error} role="alert">
            {createError}
          </p>
        )}
        <div className={styles.footer}>
          <p className={styles.note}>{pending.length > 0 ? barMessage(pending, []) : ''}</p>
          <div className={styles.actions}>
            <Button onClick={onClose} disabled={create.isPending}>
              取消
            </Button>
            <Button type="submit" variant="primary" disabled={!canCreate} aria-busy={create.isPending || undefined}>
              建立角色
            </Button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
