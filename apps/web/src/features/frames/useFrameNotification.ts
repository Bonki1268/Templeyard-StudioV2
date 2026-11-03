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

/** 這次在畫面上送出的影片生成與合成完成時通知一次（F22，第 13 階段） */
export function useFinalNotification(expecting: boolean, generating: boolean | undefined, hasFinal: boolean, onNotified: () => void) {
  const notified = useRef(false);
  // 剛送出時畫面上可能還是舊的資料（沒有在生成）：要先看到一次「生成中」，之後結束才算完成
  const sawGenerating = useRef(false);
  useEffect(() => {
    if (!expecting) {
      notified.current = false;
      sawGenerating.current = false;
      return;
    }
    if (generating) sawGenerating.current = true;
    if (generating === false && sawGenerating.current && !notified.current) {
      notified.current = true;
      if (hasFinal) notifyIfAllowed(notificationApi(), '成品合成完成', '成品影片已經合成好了，請確認後下載');
      onNotified();
    }
  }, [expecting, generating, hasFinal, onNotified]);
}
