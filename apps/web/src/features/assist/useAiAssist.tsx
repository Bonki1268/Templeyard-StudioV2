import type { AssistRequest } from '@templeyard/shared';
import { useState, type ReactNode } from 'react';
import { ApiRequestError, adoptAssist, postAssist } from '../../api/client';
import { AIAssistButton } from '../../components/AIAssistButton';
import { AiSuggestion } from './AiSuggestion';

// 「AI 幫我寫」：按鈕放在欄位標籤旁，建議區塊放在欄位下方；按「採用」才把建議填進欄位

export type AiAssistOptions = {
  /** 欄位代號（packages/shared ASSIST_FIELDS） */
  field: AssistRequest['field'];
  /** 按鈕與建議區塊的名稱（「AI 幫我寫：欄位」） */
  fieldLabel?: string;
  /** 按鈕文字，預設「AI 幫我寫」 */
  label?: string;
  seriesId?: string | undefined;
  videoId?: string | undefined;
  target?: AssistRequest['target'];
  /** 按下時欄位目前的內容 */
  userInput: () => string;
  /** 按下「採用」：把建議填進欄位（不會送出） */
  onAdopt: (text: string) => void;
};

export function useAiAssist(options: AiAssistOptions): { button: ReactNode; panel: ReactNode } {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<{ id: string; suggestion: string } | null>(null);

  async function ask() {
    setOpen(true);
    setBusy(true);
    setError(null);
    try {
      const created = await postAssist({
        field: options.field,
        userInput: options.userInput(),
        ...(options.seriesId ? { seriesId: options.seriesId } : {}),
        ...(options.videoId ? { videoId: options.videoId } : {}),
        ...(options.target ? { target: options.target } : {}),
      });
      setLog({ id: created.id, suggestion: created.suggestion });
    } catch (caught: unknown) {
      setLog(null);
      setError(caught instanceof ApiRequestError ? caught.message : 'AI 建議產生失敗，請再試一次');
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setOpen(false);
    setLog(null);
    setError(null);
  }

  function adopt() {
    if (!log) return;
    options.onAdopt(log.suggestion);
    // 採用紀錄失敗不影響已填入的內容
    void adoptAssist(log.id).catch(() => undefined);
    close();
  }

  const name = options.fieldLabel ?? options.field;
  return {
    button: (
      <AIAssistButton
        {...(options.fieldLabel ? { field: options.fieldLabel } : {})}
        {...(options.label ? { label: options.label } : {})}
        onClick={() => void ask()}
      />
    ),
    panel: open ? (
      <AiSuggestion field={name} suggestion={log?.suggestion ?? null} busy={busy} error={error} onAdopt={adopt} onRetry={() => void ask()} onDismiss={close} />
    ) : null,
  };
}
