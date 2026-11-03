import type { UpdateVideoInput, Video } from '@templeyard/shared';
import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { videos, type VideoRow } from '../db/schema.js';
import type { Clock } from '../series/repository.js';

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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** 建立影片草稿：階段為 creating，模型還沒鎖定 */
export function createVideo(db: AppDatabase, input: NewVideo, clock: Clock): Video {
  const now = clock.now().toISOString();
  const row = db
    .insert(videos)
    .values({ id: clock.newId(), ...input, stage: 'creating', createdAt: now, updatedAt: now })
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
