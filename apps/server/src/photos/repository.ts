import type { DeidBox, Photo } from '@templeyard/shared';
import type { AppDatabase } from '../db/client.js';
import type { Clock } from '../series/repository.js';

export type NewPhoto = {
  seriesId: string;
  templeId: string;
  videoId: string | null;
  originalAssetId: string;
  deidentifiedAssetId: string;
  viewKey: string | null;
  deidBoxes: DeidBox[];
};

/** 這支影片看得到的照片：同系列同一間廟的寺廟照片，加上這支影片自己的補充照片；先上傳的在前 */
export function listPhotosForVideo(
  _db: AppDatabase,
  _video: { id: string; seriesId: string; templeId: string },
): Photo[] {
  throw new Error('尚未實作');
}

/** 同系列同一間廟的寺廟照片張數（不含補充照片） */
export function countTemplePhotos(_db: AppDatabase, _seriesId: string, _templeId: string): number {
  throw new Error('尚未實作');
}

export function insertPhoto(_db: AppDatabase, _input: NewPhoto, _clock: Clock): Photo {
  throw new Error('尚未實作');
}

/** 找不到時回傳 null */
export function findPhoto(_db: AppDatabase, _id: string): Photo | null {
  throw new Error('尚未實作');
}

/** 只改有傳的欄位；找不到時回傳 null */
export function updatePhoto(
  _db: AppDatabase,
  _id: string,
  _input: { viewKey?: string | null; deidentifiedAssetId?: string; deidBoxes?: DeidBox[] },
): Photo | null {
  throw new Error('尚未實作');
}
