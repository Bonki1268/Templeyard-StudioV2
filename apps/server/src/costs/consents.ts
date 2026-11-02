import type { CostItem } from '@templeyard/shared';

// 同意憑證：使用者看過預估、按下同意後發給前端；生成時帶回來，綁定影片與這次的項目，只能用一次。
// 存在記憶體裡就好：重啟後失效，使用者重新同意即可。

export type ConsentStore = {
  issue(videoId: string, items: readonly CostItem[]): { token: string; expiresAt: string };
  /** 憑證存在、沒過期、沒用過，而且影片與項目都相同時回傳 true，並作廢 */
  consume(token: string | null | undefined, videoId: string, items: readonly CostItem[]): boolean;
};

export function createConsentStore(_options: { now: () => Date; newToken: () => string; ttlMs?: number }): ConsentStore {
  throw new Error('尚未實作');
}
