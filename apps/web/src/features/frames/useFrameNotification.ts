import { useEffect, useRef } from 'react';
import { notifyIfAllowed, type NotificationLike } from './notify';

/** 瀏覽器的通知功能；沒有時為 undefined */
export function notificationApi(): NotificationLike | undefined {
  return typeof window !== 'undefined' && 'Notification' in window ? (window.Notification as unknown as NotificationLike) : undefined;
}

/**
 * 這次在畫面上送出的生成完成時通知一次（F22）。
 * expecting：使用者剛送出生成；generating：目前是否還在生成；count：完成的格數（寫進通知內容）
 */
export function useFrameNotification(expecting: boolean, generating: boolean | undefined, count: number, onNotified: () => void) {
  const notified = useRef(false);
  useEffect(() => {
    if (!expecting) {
      notified.current = false;
      return;
    }
    if (generating === false && !notified.current) {
      notified.current = true;
      notifyIfAllowed(notificationApi(), '精緻圖生成完成', `${count} 格的精緻圖都產生好了，請逐格確認`);
      onNotified();
    }
  }, [expecting, generating, count, onNotified]);
}
