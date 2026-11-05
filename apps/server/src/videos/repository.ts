import { makeSeriesSnapshot, seriesSnapshotSchema, type UpdateVideoInput, type Video } from '@templeyard/shared';
import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { getSettings } from '../costs/repository.js';
import { videos, type VideoRow } from '../db/schema.js';
import { findSeries, type Clock } from '../series/repository.js';

export type NewVideo = { seriesId: string; templeId: string; imageModel: string; videoModel: string };

function toVideo(row: VideoRow): Video {
  return {
    id: row.id,
    seriesId: row.seriesId,
    templeId: row.templeId,
    stage: row.stage,
    imageModel: row.imageModel,
    videoModel: row.videoModel,
    modelsLockedAt: row.modelsLockedAt,
    templeBoardVersionId: row.templeBoardVersionId,
    userTempleNotes: row.userTempleNotes,
    creativeInput: row.creativeInput,
    costLimit: row.costLimit,
    copiedFromVideoId: row.copiedFromVideoId,
    // 格式不正確的快照（壞掉的舊資料）當成沒有，改讀系列目前的設定
    seriesSnapshot: seriesSnapshotSchema.nullable().catch(null).parse(row.seriesSnapshot ?? null),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * 建立影片草稿：階段為 creating，模型還沒鎖定。
 * 同時保存當下的系列設定（之後修改系列只影響之後新增的影片），並帶入「新影片的費用上限」（系列設定的費用區塊）
 */
export function createVideo(db: AppDatabase, input: NewVideo, clock: Clock): Video {
  const now = clock.now().toISOString();
  const seriesRow = findSeries(db, input.seriesId);
  const row = db
    .insert(videos)
    .values({
      id: clock.newId(),
      ...input,
      stage: 'creating',
      costLimit: getSettings(db).defaultVideoCostLimitCredits,
      seriesSnapshot: seriesRow ? makeSeriesSnapshot(seriesRow) : null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  return toVideo(row);
}

/** 找不到時回傳 null */
export function findVideo(db: AppDatabase, id: string): Video | null {
  const row = db.select().from(videos).where(eq(videos.id, id)).get();
  return row ? toVideo(row) : null;
}

/** 找不到時回傳 null */
export function updateVideo(db: AppDatabase, id: string, input: UpdateVideoInput, clock: Clock): Video | null {
  const row = db
    .update(videos)
    .set({ ...input, updatedAt: clock.now().toISOString() })
    .where(eq(videos.id, id))
    .returning()
    .get();
  return row ? toVideo(row) : null;
}
