import type { CostItem } from '@templeyard/shared';

// 同意憑證：使用者看過預估、按下同意後發給前端；生成時帶回來，綁定影片與這次的項目，只能用一次。
// 存在記憶體裡就好：重啟後失效，使用者重新同意即可。

export type ConsentStore = {
  issue(videoId: string, items: readonly CostItem[]): { token: string; expiresAt: string };
  /** 憑證存在、沒過期、沒用過，而且影片與項目都相同時回傳 true，並作廢 */
  consume(token: string | null | undefined, videoId: string, items: readonly CostItem[]): boolean;
  /** 和 consume 的條件相同，但不作廢；用來在呼叫撰寫者、上傳參考圖之前先確認 */
  peek(token: string | null | undefined, videoId: string, items: readonly CostItem[]): boolean;
};

const DEFAULT_TTL_MS = 10 * 60 * 1000;

/** 項目的比對鍵：順序不同視為不同（使用者看到的就是這個順序） */
function itemsKey(videoId: string, items: readonly CostItem[]): string {
  return JSON.stringify([videoId, items.map((item) => [item.model, item.units])]);
}

export function createConsentStore(options: { now: () => Date; newToken: () => string; ttlMs?: number }): ConsentStore {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const consents = new Map<string, { key: string; expiresAt: number }>();

  function sweep(now: number) {
    for (const [token, consent] of consents) if (consent.expiresAt < now) consents.delete(token);
  }

  return {
    issue(videoId, items) {
      const now = options.now().getTime();
      sweep(now);
      const token = options.newToken();
      const expiresAt = now + ttlMs;
      consents.set(token, { key: itemsKey(videoId, items), expiresAt });
      return { token, expiresAt: new Date(expiresAt).toISOString() };
    },
    consume(token, videoId, items) {
      if (!token) return false;
      const consent = consents.get(token);
      if (!consent) return false;
      if (consent.expiresAt < options.now().getTime()) {
        consents.delete(token);
        return false;
      }
      if (consent.key !== itemsKey(videoId, items)) return false;
      consents.delete(token);
      return true;
    },
    peek() {
      throw new Error('尚未實作');
    },
  };
}
