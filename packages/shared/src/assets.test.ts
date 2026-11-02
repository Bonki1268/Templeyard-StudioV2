import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  ASSET_KINDS,
  NotCloudOkError,
  cloudOkForKind,
  requireCloudOk,
  type Asset,
  type AssetKind,
  type CloudOkAsset,
} from './assets.js';

function asset(kind: AssetKind, cloudOk: boolean): Asset {
  return { id: `asset-${kind}`, kind, mime: 'image/png', width: 320, height: 240, durationSec: null, sha256: 'abc', cloudOk };
}

describe('資產能不能送往雲端（cloud_ok）', () => {
  it('原圖永遠不能送往雲端', () => {
    expect(cloudOkForKind('original_photo')).toBe(false);
  });

  it.each(ASSET_KINDS.filter((kind) => kind !== 'original_photo'))('%s 可以送往雲端', (kind) => {
    expect(cloudOkForKind(kind)).toBe(true);
  });
});

describe('requireCloudOk：送往雲端前的執行期檢查', () => {
  it('去識別後的照片通過檢查，回傳同一份資料', () => {
    const deid = asset('deid_photo', true);
    expect(requireCloudOk(deid)).toEqual(deid);
  });

  it('原圖丟出 NotCloudOkError，並帶有資產編號', () => {
    const original = asset('original_photo', false);
    expect(() => requireCloudOk(original)).toThrow(NotCloudOkError);
    expect(() => requireCloudOk(original)).toThrow('這個檔案不能送往雲端：asset-original_photo');
  });

  it('cloudOk 被改成 true 的原圖仍然被擋下（以種類為準）', () => {
    expect(() => requireCloudOk(asset('original_photo', true))).toThrow(NotCloudOkError);
  });

  it('cloudOk 為 false 的其他資產也被擋下', () => {
    expect(() => requireCloudOk(asset('deid_photo', false))).toThrow(NotCloudOkError);
  });
});

describe('CloudOkAsset 型別（由 pnpm typecheck 檢查）', () => {
  it('一般的 Asset 不能當成 CloudOkAsset，只有 requireCloudOk 會產生它', () => {
    expectTypeOf<Asset>().not.toExtend<CloudOkAsset>();
    expectTypeOf(requireCloudOk).returns.toEqualTypeOf<CloudOkAsset>();
  });
});
