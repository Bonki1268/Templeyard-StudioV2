import type { Asset, AssetKind, CloudOkAsset } from '@templeyard/shared';
import type { AppDatabase } from '../db/client.js';

export type NewAsset = {
  id: string;
  kind: AssetKind;
  path: string;
  mime: string;
  sha256: string;
  width?: number | null;
  height?: number | null;
};

/** 找不到資產 */
export class AssetNotFoundError extends Error {
  constructor(readonly assetId: string) {
    super(`找不到檔案：${assetId}`);
    this.name = 'AssetNotFoundError';
  }
}

/** 寫入資產；cloud_ok 一律由種類決定，呼叫端不能指定 */
export function insertAsset(_db: AppDatabase, _input: NewAsset): Asset {
  throw new Error('尚未實作');
}

/** 找不到時回傳 null */
export function findAsset(_db: AppDatabase, _id: string): (Asset & { path: string }) | null {
  throw new Error('尚未實作');
}

/** 取得可以送往雲端的資產：找不到丟 AssetNotFoundError，原圖丟 NotCloudOkError */
export function getCloudOkAsset(_db: AppDatabase, _id: string): CloudOkAsset {
  throw new Error('尚未實作');
}
