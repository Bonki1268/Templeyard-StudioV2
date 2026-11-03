import { QUICK_TAGS, applyQuickTag } from '@templeyard/shared';
import { useId, useState } from 'react';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { useAiAssist } from '../assist/useAiAssist';
import styles from './StudioPanels.module.css';

type HomePanelProps = {
  videoId: string;
  templeName: string;
  sending: boolean;
  onSend: (content: string) => void;
};

/** 創作首頁：一個輸入框與快捷標籤（規格書「3. 創作對話」） */
export function HomePanel({ videoId, templeName, sending, onSend }: HomePanelProps) {
  const titleId = useId();
  const [input, setInput] = useState('');
  const assist = useAiAssist({
    field: 'creative.input',
    fieldLabel: '你想創作什麼',
    videoId,
    userInput: () => input,
    onAdopt: setInput,
  });

  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.panelTitle}>
        你想為{templeName}創作什麼？
      </h2>
      <p className={styles.muted}>一句話就可以，例如「講媽祖顯靈救漁民的故事」；也可以貼上一整段故事。</p>
      <TextField
        label="你想創作什麼"
        value={input}
        onChange={setInput}
        multiline
        maxLength={2000}
        labelAccessory={assist.button}
      />
      {assist.panel}
      <div className={styles.tags} role="group" aria-label="快捷標籤">
        {QUICK_TAGS.map((tag) => (
          <button key={tag} type="button" className={styles.tag} onClick={() => setInput((current) => applyQuickTag(current, tag, templeName))}>
            {tag}
          </button>
        ))}
      </div>
      <div className={styles.actions}>
        <Button variant="primary" disabled={sending || input.trim() === ''} onClick={() => onSend(input.trim())}>
          送出
        </Button>
      </div>
    </section>
  );
}
