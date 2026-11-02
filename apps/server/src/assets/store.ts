import type { AssetKind } from '@templeyard/shared';

// 檔案存在 data/assets/ 底下；資料庫只存相對路徑。
// 原圖放 originals/、去識別後的圖放 deid/，分開存放（02「去識別」）。

export type SavedFile = { path: string; sha256: string };

export type AssetStore = {
  /** 寫入檔案，回傳相對路徑與 sha256 */
  save(input: { id: string; kind: AssetKind; mime: string; bytes: Uint8Array }): SavedFile;
  /** 讀取相對路徑的檔案 */
  read(relativePath: string): Buffer;
  /** 檔案是否存在 */
  exists(relativePath: string): boolean;
};

export function createAssetStore(_rootDir: string): AssetStore {
  throw new Error('尚未實作');
}
