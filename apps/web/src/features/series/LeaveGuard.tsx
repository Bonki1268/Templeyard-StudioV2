import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/Button';
import { useDialog } from '../../components/useDialog';
import styles from './LeaveGuard.module.css';

// 有未儲存的變更時，離開頁面先提醒（系列設定分頁）：點分頁與頁首連結時彈出對話框；重新整理或關閉頁面用瀏覽器的提醒

type Guard = {
  /** 目前頁面有沒有未儲存的變更 */
  setDirty: (dirty: boolean) => void;
  /** 連結的 onClick：有未儲存的變更時攔下來問使用者；沒有就照常前往 */
  intercept: (event: MouseEvent<HTMLElement>, to: string) => void;
};

const NO_GUARD: Guard = { setDirty: () => undefined, intercept: () => undefined };

const GuardContext = createContext<Guard>(NO_GUARD);

export function useLeaveGuard(): Guard {
  return useContext(GuardContext);
}

export function LeaveGuardProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const dirtyRef = useRef(false);
  const [target, setTarget] = useState<string | null>(null);

  const setDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);

  const intercept = useCallback((event: MouseEvent<HTMLElement>, to: string) => {
    if (!dirtyRef.current) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setTarget(to);
  }, []);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const value = useMemo(() => ({ setDirty, intercept }), [setDirty, intercept]);

  return (
    <GuardContext.Provider value={value}>
      {children}
      {target !== null && (
        <LeaveDialog
          onStay={() => setTarget(null)}
          onLeave={() => {
            const to = target;
            dirtyRef.current = false;
            setTarget(null);
            void navigate(to);
          }}
        />
      )}
    </GuardContext.Provider>
  );
}

function LeaveDialog({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  const { ref, titleId } = useDialog(onStay);
  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        有未儲存的變更
      </h2>
      <p className={styles.text}>現在離開，這些修改不會儲存。</p>
      <div className={styles.actions}>
        <Button onClick={onStay}>留在這裡</Button>
        <Button variant="primary" onClick={onLeave}>
          離開並放棄變更
        </Button>
      </div>
    </dialog>
  );
}
