import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
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

const FOLDERS: Record<AssetKind, string> = {
  original_photo: 'originals',
  deid_photo: 'deid',
  view: 'views',
  character_sheet: 'characters',
  frame: 'frames',
  clip: 'clips',
  final: 'finals',
  subtitle: 'subtitles',
  audio: 'audio',
};

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'text/x-ssa': 'ass',
};

export function createAssetStore(rootDir: string): AssetStore {
  const root = path.resolve(rootDir);

  // 相對路徑一律限制在資產資料夾內
  function resolveInside(relativePath: string): string {
    const absolute = path.resolve(root, relativePath);
    if (absolute !== root && !absolute.startsWith(root + path.sep)) {
      throw new Error('檔案路徑不在資產資料夾內');
    }
    return absolute;
  }

  return {
    save({ id, kind, mime, bytes }) {
      const extension = EXTENSIONS[mime] ?? 'bin';
      const relativePath = `${FOLDERS[kind]}/${id}.${extension}`;
      const absolute = resolveInside(relativePath);
      mkdirSync(path.dirname(absolute), { recursive: true });
      writeFileSync(absolute, bytes, { flag: 'wx' });
      return { path: relativePath, sha256: createHash('sha256').update(bytes).digest('hex') };
    },
    read(relativePath) {
      return readFileSync(resolveInside(relativePath));
    },
    exists(relativePath) {
      return existsSync(resolveInside(relativePath));
    },
  };
}
