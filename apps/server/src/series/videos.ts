import { filterVideos, sortVideos, videoStatus, videoTitle, type SeriesVideosResponse, type VideoFilter, type VideoSort } from '@templeyard/shared';
import { and, asc, desc, eq, isNotNull } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { assets, characters, clips, finals, frames, plans, questionnaires, shots, temples, videos } from '../db/schema.js';

// 系列頁「過去的影片」與首頁卡片的影片列表（使用者 2026-11-04 提出；第 14 階段加上篩選、排序與影片卡細節）

export function listSeriesVideos(db: AppDatabase, seriesId: string, options: { status?: VideoFilter; sort?: VideoSort } = {}): SeriesVideosResponse {
  const defaultsSource = firstSubmittedVideoId(db, seriesId);
  const rows = db
    .select({
      id: videos.id,
      seriesId: videos.seriesId,
      stage: videos.stage,
      createdAt: videos.createdAt,
      updatedAt: videos.updatedAt,
      imageModel: videos.imageModel,
      videoModel: videos.videoModel,
      creativeInput: videos.creativeInput,
      templeName: temples.name,
      district: temples.district,
    })
    .from(videos)
    .innerJoin(temples, eq(videos.templeId, temples.id))
    .where(eq(videos.seriesId, seriesId))
    .all();
  const cards = rows.map(({ creativeInput, ...row }) => {
    const status = videoStatus({ stage: row.stage, staleFrames: staleFrameCount(db, row.id), staleClips: staleClipCount(db, row.id) });
    return {
      ...row,
      title: videoTitle(row.templeName, creativeInput),
      statusLabel: status.label,
      group: status.group,
      finalDurationSec: row.stage === 'final' || row.stage === 'done' ? finalDuration(db, row.id) : null,
      thumbnailAssetId: thumbnailOf(db, row.id),
      isDefaultsSource: row.id === defaultsSource,
    };
  });
  const list = sortVideos(filterVideos(cards, options.status ?? 'all'), options.sort ?? 'updated');
  const names = db
    .select({ name: characters.name })
    .from(characters)
    .where(and(eq(characters.seriesId, seriesId), eq(characters.isSeries, true)))
    .all()
    .map((row) => row.name);
  return { videos: list, characters: [...new Set(names)] };
}

/** 系列問卷預設值的來源：系列第一支送出問卷的影片 */
export function firstSubmittedVideoId(db: AppDatabase, seriesId: string): string | null {
  const row = db
    .select({ videoId: questionnaires.videoId })
    .from(questionnaires)
    .innerJoin(videos, eq(questionnaires.videoId, videos.id))
    .where(and(eq(videos.seriesId, seriesId), isNotNull(questionnaires.submittedAt)))
    .orderBy(asc(questionnaires.submittedAt), asc(questionnaires.videoId))
    .get();
  return row?.videoId ?? null;
}

/** 需重新確認的精緻圖格數（有格子的現行精緻圖標示需重新確認） */
function staleFrameCount(db: AppDatabase, videoId: string): number {
  const rows = db.select({ shotKey: frames.shotKey }).from(frames).where(and(eq(frames.videoId, videoId), eq(frames.selected, true), eq(frames.needsReconfirm, true))).all();
  return new Set(rows.map((row) => row.shotKey)).size;
}

/** 需重新確認的影片格數 */
function staleClipCount(db: AppDatabase, videoId: string): number {
  const rows = db.select({ shotKey: clips.shotKey }).from(clips).where(and(eq(clips.videoId, videoId), eq(clips.selected, true), eq(clips.needsReconfirm, true))).all();
  return new Set(rows.map((row) => row.shotKey)).size;
}

/** 最新一版成品的長度（秒） */
function finalDuration(db: AppDatabase, videoId: string): number | null {
  const row = db
    .select({ durationSec: assets.durationSec })
    .from(finals)
    .innerJoin(assets, eq(finals.assetId, assets.id))
    .where(eq(finals.videoId, videoId))
    .orderBy(desc(finals.createdAt))
    .get();
  return row?.durationSec ?? null;
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
