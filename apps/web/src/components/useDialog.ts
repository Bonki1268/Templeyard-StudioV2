import { useEffect, useId, useRef } from 'react';

/** 原生 <dialog> 的共用做法：掛上就以 showModal 打開（內建焦點管理與 Esc），按 Esc 時呼叫 onClose */
export function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const cancel = (event: Event) => {
      event.preventDefault();
      closeRef.current();
    };
    dialog.addEventListener('cancel', cancel);
    return () => dialog.removeEventListener('cancel', cancel);
  }, []);

  return { ref, titleId };
}
