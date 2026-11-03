import type { SeriesVideosResponse } from '@templeyard/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { characters, frames, plans, shots, temples, videos } from '../db/schema.js';

// 系列設定的影片列表（使用者 2026-11-04 提出）：每支影片的寺廟、階段、更新時間與縮圖；系列的共同角色

export function listSeriesVideos(db: AppDatabase, seriesId: string): SeriesVideosResponse {
  const rows = db
    .select({ id: videos.id, seriesId: videos.seriesId, stage: videos.stage, updatedAt: videos.updatedAt, templeName: temples.name })
    .from(videos)
    .innerJoin(temples, eq(videos.templeId, temples.id))
    .where(eq(videos.seriesId, seriesId))
    .orderBy(desc(videos.updatedAt), desc(videos.id))
    .all();
  const list = rows.map((row) => ({ ...row, thumbnailAssetId: thumbnailOf(db, row.id) }));
  const names = db
    .select({ name: characters.name })
    .from(characters)
    .where(and(eq(characters.seriesId, seriesId), eq(characters.isSeries, true)))
    .all()
    .map((row) => row.name);
  return { videos: list, characters: [...new Set(names)] };
}

/** 縮圖：現行方案第 1 格最新的首格精緻圖 */
function thumbnailOf(db: AppDatabase, videoId: string): string | null {
  const plan = db.select({ id: plans.id }).from(plans).where(eq(plans.videoId, videoId)).orderBy(desc(plans.version)).get();
  if (!plan) return null;
  const first = db.select({ shotKey: shots.shotKey }).from(shots).where(and(eq(shots.planId, plan.id), eq(shots.seq, 1))).get();
  if (!first) return null;
  const frame = db
    .select({ assetId: frames.assetId })
    .from(frames)
    .where(and(eq(frames.videoId, videoId), eq(frames.shotKey, first.shotKey), eq(frames.kind, 'first')))
    .orderBy(desc(frames.createdAt))
    .all()
    .find((row) => row.assetId);
  return frame?.assetId ?? null;
}
