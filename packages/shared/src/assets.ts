import { z } from 'zod';

// 檔案資產（docs/05-Backend-Schema.md「assets」）與「原圖不上雲」的型別防線（02「去識別」）。

export const ASSET_KINDS = [
  'original_photo',
  'deid_photo',
  'view',
  'character_sheet',
  'frame',
  'clip',
  'final',
  'subtitle',
  'audio',
] as const;
export const assetKindSchema = z.enum(ASSET_KINDS);
export type AssetKind = z.infer<typeof assetKindSchema>;

export const assetSchema = z.object({
  id: z.string(),
  kind: assetKindSchema,
  mime: z.string(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  durationSec: z.number().nullable(),
  sha256: z.string(),
  cloudOk: z.boolean(),
});
export type Asset = z.infer<typeof assetSchema>;

export const assetResponseSchema = z.object({ asset: assetSchema });

/** 依資產種類決定能不能送往雲端：原圖（original_photo）永遠不行 */
export function cloudOkForKind(_kind: AssetKind): boolean {
  throw new Error('尚未實作');
}

declare const cloudOkBrand: unique symbol;

/**
 * 允許送往 Comfy Cloud 的資產。
 * 只能由 requireCloudOk 產生；送往雲端的函式參數一律用這個型別，原圖在編譯期就傳不進去。
 */
export type CloudOkAsset = Asset & { readonly cloudOk: true; readonly [cloudOkBrand]: true };

/** 有資產想送往雲端，但它不允許上雲 */
export class NotCloudOkError extends Error {
  constructor(readonly assetId: string) {
    super(`這個檔案不能送往雲端：${assetId}`);
    this.name = 'NotCloudOkError';
  }
}

/** 執行期檢查：原圖或 cloudOk 為 false 的資產一律丟出 NotCloudOkError */
export function requireCloudOk(_asset: Asset): CloudOkAsset {
  throw new Error('尚未實作');
}
