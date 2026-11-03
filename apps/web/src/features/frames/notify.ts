// 瀏覽器通知（F22）：生成完成時通知；使用者沒有允許就不通知（畫面上照樣顯示結果）

export type NotificationLike = {
  permission: NotificationPermission;
  requestPermission(): Promise<NotificationPermission>;
  new (title: string, options?: NotificationOptions): unknown;
};

/** 使用者按下「生成」時先詢問（瀏覽器只允許在使用者操作時詢問）；已經決定過就不再問 */
export async function askNotificationPermission(_api: NotificationLike | undefined): Promise<void> {
  throw new Error('尚未實作');
}

/** 已允許時送出通知；沒有通知功能或沒有允許時不做事。回傳是否送出 */
export function notifyIfAllowed(_api: NotificationLike | undefined, _title: string, _body?: string): boolean {
  throw new Error('尚未實作');
}
