import { NotCloudOkError } from '@templeyard/shared';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../db/client.js';
import { assets } from '../db/schema.js';
import { AssetNotFoundError, findAsset, getCloudOkAsset, insertAsset } from './repository.js';

function newDb() {
  return openDatabase(':memory:');
}

const base = { mime: 'image/png', sha256: 'abc', width: 320, height: 240 };

describe('資產紀錄', () => {
  it('原圖寫入後 cloud_ok 為 false', () => {
    const db = newDb();

    const asset = insertAsset(db, { ...base, id: 'o1', kind: 'original_photo', path: 'originals/o1.png' });

    expect(asset.cloudOk).toBe(false);
    expect(findAsset(db, 'o1')).toMatchObject({ kind: 'original_photo', cloudOk: false, path: 'originals/o1.png' });
  });

  it('去識別後的照片寫入後 cloud_ok 為 true', () => {
    const db = newDb();

    const asset = insertAsset(db, { ...base, id: 'd1', kind: 'deid_photo', path: 'deid/d1.png' });

    expect(asset.cloudOk).toBe(true);
  });

  it('找不到時回傳 null', () => {
    expect(findAsset(newDb(), 'missing')).toBeNull();
  });

  it('資料庫層也擋下 cloud_ok = 1 的原圖', () => {
    const db = newDb();

    expect(() =>
      db
        .insert(assets)
        .values({ ...base, id: 'o2', kind: 'original_photo', path: 'originals/o2.png', cloudOk: true })
        .run(),
    ).toThrow(/CHECK constraint failed/);
  });
});

describe('取得可以送往雲端的資產', () => {
  it('去識別後的照片可以取得，型別是 CloudOkAsset', () => {
    const db = newDb();
    insertAsset(db, { ...base, id: 'd1', kind: 'deid_photo', path: 'deid/d1.png' });

    const asset = getCloudOkAsset(db, 'd1');

    expect(asset).toMatchObject({ id: 'd1', kind: 'deid_photo', cloudOk: true });
    expect(asset).not.toHaveProperty('path');
  });

  it('原圖丟出 NotCloudOkError', () => {
    const db = newDb();
    insertAsset(db, { ...base, id: 'o1', kind: 'original_photo', path: 'originals/o1.png' });

    expect(() => getCloudOkAsset(db, 'o1')).toThrow(NotCloudOkError);
  });

  it('找不到時丟出 AssetNotFoundError', () => {
    expect(() => getCloudOkAsset(newDb(), 'missing')).toThrow(AssetNotFoundError);
  });
});
