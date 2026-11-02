import type { DeidBox, Photo } from '@templeyard/shared';
import { and, asc, count, eq, isNull, or, sql } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { photos, type PhotoRow } from '../db/schema.js';
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

function toPhoto(row: PhotoRow): Photo {
  return {
    id: row.id,
    seriesId: row.seriesId,
    templeId: row.templeId,
    videoId: row.videoId,
    originalAssetId: row.originalAssetId,
    deidentifiedAssetId: row.deidentifiedAssetId,
    viewKey: row.viewKey,
    deidBoxes: row.deidBoxes,
    createdAt: row.createdAt,
  };
}

/** 這支影片看得到的照片：同系列同一間廟的寺廟照片，加上這支影片自己的補充照片；先上傳的在前 */
export function listPhotosForVideo(db: AppDatabase, video: { id: string; seriesId: string; templeId: string }): Photo[] {
  return db
    .select()
    .from(photos)
    .where(
      and(
        eq(photos.seriesId, video.seriesId),
        eq(photos.templeId, video.templeId),
        or(isNull(photos.videoId), eq(photos.videoId, video.id)),
      ),
    )
    // 同一毫秒上傳的照片以寫入順序（rowid）排列
    .orderBy(asc(photos.createdAt), sql`rowid`)
    .all()
    .map(toPhoto);
}

/** 同系列同一間廟的寺廟照片張數（不含補充照片） */
export function countTemplePhotos(db: AppDatabase, seriesId: string, templeId: string): number {
  const row = db
    .select({ total: count() })
    .from(photos)
    .where(and(eq(photos.seriesId, seriesId), eq(photos.templeId, templeId), isNull(photos.videoId)))
    .get();
  return row?.total ?? 0;
}

export function insertPhoto(db: AppDatabase, input: NewPhoto, clock: Clock): Photo {
  const row = db
    .insert(photos)
    .values({ id: clock.newId(), ...input, createdAt: clock.now().toISOString() })
    .returning()
    .get();
  return toPhoto(row);
}

/** 找不到時回傳 null */
export function findPhoto(db: AppDatabase, id: string): Photo | null {
  const row = db.select().from(photos).where(eq(photos.id, id)).get();
  return row ? toPhoto(row) : null;
}

/** 只改有傳的欄位；找不到時回傳 null */
export function updatePhoto(
  db: AppDatabase,
  id: string,
  input: { viewKey?: string | null; deidentifiedAssetId?: string; deidBoxes?: DeidBox[] },
): Photo | null {
  const row = db.update(photos).set(input).where(eq(photos.id, id)).returning().get();
  return row ? toPhoto(row) : null;
}
