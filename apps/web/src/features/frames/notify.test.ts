import { describe, expect, it, vi } from 'vitest';
import { askNotificationPermission, notifyIfAllowed, type NotificationLike } from './notify';

function fakeApi(permission: NotificationPermission) {
  const shown: { title: string; options: NotificationOptions | undefined }[] = [];
  const requestPermission = vi.fn(async () => 'granted' as NotificationPermission);
  const Api = class {
    static permission = permission;
    static requestPermission = requestPermission;
    constructor(title: string, options?: NotificationOptions) {
      shown.push({ title, options });
    }
  } as unknown as NotificationLike;
  return { Api, shown, requestPermission };
}

describe('瀏覽器通知', () => {
  it('已允許：送出通知', () => {
    const { Api, shown } = fakeApi('granted');
    expect(notifyIfAllowed(Api, '精緻圖生成完成', '4 格都產生好了')).toBe(true);
    expect(shown).toEqual([{ title: '精緻圖生成完成', options: { body: '4 格都產生好了' } }]);
  });

  it.each(['denied', 'default'] as const)('%s：不送出', (permission) => {
    const { Api, shown } = fakeApi(permission);
    expect(notifyIfAllowed(Api, '精緻圖生成完成')).toBe(false);
    expect(shown).toEqual([]);
  });

  it('瀏覽器沒有通知功能：不送出、不出錯', () => {
    expect(notifyIfAllowed(undefined, '精緻圖生成完成')).toBe(false);
  });

  it('還沒決定時詢問一次；已經允許或拒絕就不再問', async () => {
    const asked = fakeApi('default');
    await askNotificationPermission(asked.Api);
    expect(asked.requestPermission).toHaveBeenCalledTimes(1);

    for (const permission of ['granted', 'denied'] as const) {
      const decided = fakeApi(permission);
      await askNotificationPermission(decided.Api);
      expect(decided.requestPermission).not.toHaveBeenCalled();
    }
    await expect(askNotificationPermission(undefined)).resolves.toBeUndefined();
  });
});
