import type { UpdateVideoInput, Video } from '@templeyard/shared';
import type { AppDatabase } from '../db/client.js';
import type { Clock } from '../series/repository.js';

export type NewVideo = { seriesId: string; templeId: string; imageModel: string; videoModel: string };

/** 建立影片草稿：階段為 creating，模型還沒鎖定 */
export function createVideo(_db: AppDatabase, _input: NewVideo, _clock: Clock): Video {
  throw new Error('尚未實作');
}

/** 找不到時回傳 null */
export function findVideo(_db: AppDatabase, _id: string): Video | null {
  throw new Error('尚未實作');
}

/** 找不到時回傳 null */
export function updateVideo(_db: AppDatabase, _id: string, _input: UpdateVideoInput, _clock: Clock): Video | null {
  throw new Error('尚未實作');
}
