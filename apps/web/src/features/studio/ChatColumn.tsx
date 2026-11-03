import type { ChatMessage, ToolCallSummary } from '@templeyard/shared';
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { Tag } from '../../components/Tag';
import { TextField } from '../../components/TextField';
import styles from './ChatColumn.module.css';
import type { LiveReply } from './useStudioChat';

type ChatColumnProps = {
  messages: ChatMessage[];
  live: LiveReply | null;
  sending: boolean;
  error: string | null;
  onSend: (content: string) => void;
};

function ToolCalls({ calls }: { calls: ToolCallSummary[] }) {
  if (calls.length === 0) return null;
  return (
    <ul className={styles.tools} aria-label="Agent 做了">
      {calls.map((call, index) => (
        <li key={`${call.name}-${index}`}>
          <Tag tone={call.ok ? 'success' : 'warning'}>{call.label}</Tag>
          <span className={styles.toolSummary}>{call.summary}</span>
        </li>
      ))}
    </ul>
  );
}

/** 一則訊息：多行內容每行一段（問卷答案摘要一題一行） */
function Bubble({ who, lines, calls }: { who: 'user' | 'agent'; lines: string[]; calls: ToolCallSummary[] }) {
  return (
    <article className={who === 'user' ? styles.user : styles.agent} aria-label={who === 'user' ? '我說' : 'Agent 說'}>
      {lines.map((line, index) => (
        <p key={index} className={styles.line}>
          {line}
        </p>
      ))}
      <ToolCalls calls={calls} />
    </article>
  );
}

/** 左欄：與創作 Agent 的對話；底部是輸入框 */
export function ChatColumn({ messages, live, sending, error, onSend }: ChatColumnProps) {
  const [draft, setDraft] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    setDraft('');
    onSend(content);
  }

  return (
    <aside className={styles.column}>
      <section className={styles.log} aria-label="對話">
        {messages.length === 0 && !live && <p className={styles.empty}>還沒有對話。在右邊說說你想為這間廟創作什麼。</p>}
        {messages.map((message) => (
          <Bubble key={message.id} who={message.role} lines={message.content.split('\n')} calls={message.toolCalls} />
        ))}
        {live && (live.text.length > 0 || live.toolCalls.length > 0) && <Bubble who="agent" lines={live.text} calls={live.toolCalls} />}
        {sending && (
          <p className={styles.status} role="status">
            Agent 正在回覆…
          </p>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </section>
      <form className={styles.composer} onSubmit={submit}>
        <TextField label="對 Agent 說" value={draft} onChange={setDraft} multiline maxLength={2000} placeholder="例如：觀眾以年輕人為主" />
        <Button type="submit" disabled={sending || draft.trim() === ''}>
          傳送
        </Button>
      </form>
    </aside>
  );
}
