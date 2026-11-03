import { z } from 'zod';
import { VIDEO_STAGES, type VideoStage } from './videos.js';

// 系列首頁的影片列表（使用者 2026-11-04 提出）：系列卡片列出這個系列的每支影片，點了回到它目前的階段

export const seriesVideoSchema = z.object({
  id: z.string(),
  seriesId: z.string(),
  templeName: z.string(),
  stage: z.enum(VIDEO_STAGES),
  updatedAt: z.string(),
  /** 縮圖：有成品時是第 1 格的首格精緻圖；還沒有圖時是 null */
  thumbnailAssetId: z.string().nullable(),
});
export type SeriesVideo = z.infer<typeof seriesVideoSchema>;

/** GET /api/series/:id/videos：這個系列的影片（最近更新的在前）與共同角色的名稱 */
export const seriesVideosResponseSchema = z.object({ videos: z.array(seriesVideoSchema), characters: z.array(z.string()) });
export type SeriesVideosResponse = z.infer<typeof seriesVideosResponseSchema>;

/** 系列卡片上的寺廟標籤：用過的寺廟，不重複，依最近更新的順序 */
export function templeTags(videos: readonly Pick<SeriesVideo, 'templeName'>[]): string[] {
  void videos;
  throw new Error('尚未實作');
}

/** 影片階段的名稱（05「videos.stage」） */
export function videoStageLabel(stage: VideoStage): string {
  void stage;
  throw new Error('尚未實作');
}

/**
 * 點影片時前往的頁面（03 路由表）：
 * - creating：建立影片頁（帶 ?video=）
 * - board_pending：寺廟定裝版頁
 * - 其他：創作工作區；有成品（final、done）時打開成品面板
 */
export function videoEntryPath(video: Pick<SeriesVideo, 'id' | 'seriesId' | 'stage'>): string {
  void video;
  throw new Error('尚未實作');
}
