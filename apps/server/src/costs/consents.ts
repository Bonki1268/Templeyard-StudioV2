import type { CostItem } from '@templeyard/shared';

// 同意憑證：使用者看過預估、按下同意後發給前端；生成時帶回來，綁定範圍（影片，或系列角色庫的系列）與這次的項目，只能用一次。
// 存在記憶體裡就好：重啟後失效，使用者重新同意即可。

export type ConsentStore = {
  issue(scope: string, items: readonly CostItem[]): { token: string; expiresAt: string };
  /** 憑證存在、沒過期、沒用過，而且範圍與項目都相同時回傳 true，並作廢 */
  consume(token: string | null | undefined, scope: string, items: readonly CostItem[]): boolean;
  /** 和 consume 的條件相同，但不作廢；用來在呼叫撰寫者、上傳參考圖之前先確認 */
  peek(token: string | null | undefined, scope: string, items: readonly CostItem[]): boolean;
};

/** 系列角色庫的生成不屬於任何影片：同意憑證綁定系列（使用者 2026-11-05 提出） */
export function seriesConsentScope(seriesId: string): string {
  return `series:${seriesId}`;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000;

/** 項目的比對鍵：順序不同視為不同（使用者看到的就是這個順序） */
function itemsKey(scope: string, items: readonly CostItem[]): string {
  return JSON.stringify([scope, items.map((item) => [item.model, item.units])]);
}

export function createConsentStore(options: { now: () => Date; newToken: () => string; ttlMs?: number }): ConsentStore {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const consents = new Map<string, { key: string; expiresAt: number }>();

  function sweep(now: number) {
    for (const [token, consent] of consents) if (consent.expiresAt < now) consents.delete(token);
  }

  return {
    issue(scope, items) {
      const now = options.now().getTime();
      sweep(now);
      const token = options.newToken();
      const expiresAt = now + ttlMs;
      consents.set(token, { key: itemsKey(scope, items), expiresAt });
      return { token, expiresAt: new Date(expiresAt).toISOString() };
    },
    consume(token, scope, items) {
      if (!token) return false;
      const consent = consents.get(token);
      if (!consent) return false;
      if (consent.expiresAt < options.now().getTime()) {
        consents.delete(token);
        return false;
      }
      if (consent.key !== itemsKey(scope, items)) return false;
      consents.delete(token);
      return true;
    },
    peek(token, scope, items) {
      if (!token) return false;
      const consent = consents.get(token);
      if (!consent) return false;
      return consent.expiresAt >= options.now().getTime() && consent.key === itemsKey(scope, items);
    },
  };
}
