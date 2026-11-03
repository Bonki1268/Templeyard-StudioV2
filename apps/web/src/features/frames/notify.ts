// 瀏覽器通知（F22）：生成完成時通知；使用者沒有允許就不通知（畫面上照樣顯示結果）

export type NotificationLike = {
  permission: NotificationPermission;
  requestPermission(): Promise<NotificationPermission>;
  new (title: string, options?: NotificationOptions): unknown;
};

/** 使用者按下「生成」時先詢問（瀏覽器只允許在使用者操作時詢問）；已經決定過就不再問 */
export async function askNotificationPermission(api: NotificationLike | undefined): Promise<void> {
  if (!api || api.permission !== 'default') return;
  try {
    await api.requestPermission();
  } catch {
    // 瀏覽器不讓問：當成沒有允許
  }
}

/** 已允許時送出通知；沒有通知功能或沒有允許時不做事。回傳是否送出 */
export function notifyIfAllowed(api: NotificationLike | undefined, title: string, body?: string): boolean {
  if (!api || api.permission !== 'granted') return false;
  new api(title, body === undefined ? undefined : { body });
  return true;
}
