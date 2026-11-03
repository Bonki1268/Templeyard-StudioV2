import { NotCloudOkError, cloudOkForKind, requireCloudOk, type Asset, type AssetKind, type CloudOkAsset } from '@templeyard/shared';
import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { assets, type AssetRow } from '../db/schema.js';

export type NewAsset = {
  id: string;
  kind: AssetKind;
  path: string;
  mime: string;
  sha256: string;
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
};

/** 找不到資產 */
export class AssetNotFoundError extends Error {
  constructor(readonly assetId: string) {
    super(`找不到檔案：${assetId}`);
    this.name = 'AssetNotFoundError';
  }
}

function toAsset(row: AssetRow): Asset {
  return {
    id: row.id,
    kind: row.kind,
    mime: row.mime,
    width: row.width,
    height: row.height,
    durationSec: row.durationSec,
    sha256: row.sha256,
    cloudOk: row.cloudOk,
  };
}

/** 寫入資產；cloud_ok 一律由種類決定，呼叫端不能指定 */
export function insertAsset(db: AppDatabase, input: NewAsset): Asset {
  const row = db
    .insert(assets)
    .values({
      id: input.id,
      kind: input.kind,
      path: input.path,
      mime: input.mime,
      sha256: input.sha256,
      width: input.width ?? null,
      height: input.height ?? null,
      durationSec: input.durationSec ?? null,
      cloudOk: cloudOkForKind(input.kind),
    })
    .returning()
    .get();
  return toAsset(row);
}

/** 找不到時回傳 null */
export function findAsset(db: AppDatabase, id: string): (Asset & { path: string }) | null {
  const row = db.select().from(assets).where(eq(assets.id, id)).get();
  return row ? { ...toAsset(row), path: row.path } : null;
}

/** 取得可以送往雲端的資產：找不到丟 AssetNotFoundError，原圖丟 NotCloudOkError */
export function getCloudOkAsset(db: AppDatabase, id: string): CloudOkAsset {
  const row = db.select().from(assets).where(eq(assets.id, id)).get();
  if (!row) throw new AssetNotFoundError(id);
  if (!row.cloudOk) throw new NotCloudOkError(id);
  return requireCloudOk(toAsset(row));
}
