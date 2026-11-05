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
  // 第 14 階段：過去的影片分頁的影片卡
  /** 行政區 */
  district: z.string().default(''),
  /** 影片標題：寺廟名稱，有想講的故事時接在後面 */
  title: z.string().default(''),
  /** 鎖定的（或建立時選的）圖片與影片模型 */
  imageModel: z.string().default(''),
  videoModel: z.string().default(''),
  /** 狀態標籤，含細節（例如「精緻圖・2 格需重新確認」） */
  statusLabel: z.string().default(''),
  group: z.enum(['wip', 'done']).default('wip'),
  /** 有成品時的成品長度（秒） */
  finalDurationSec: z.number().nullable().default(null),
  createdAt: z.string().default(''),
  /** 系列問卷預設值來自這支影片（系列第一支送出問卷的影片） */
  isDefaultsSource: z.boolean().default(false),
});
export type SeriesVideo = z.infer<typeof seriesVideoSchema>;

/** GET /api/series/:id/videos：這個系列的影片（最近更新的在前）與共同角色的名稱 */
export const seriesVideosResponseSchema = z.object({ videos: z.array(seriesVideoSchema), characters: z.array(z.string()) });
export type SeriesVideosResponse = z.infer<typeof seriesVideosResponseSchema>;

/** 系列卡片上的寺廟標籤：用過的寺廟，不重複，依最近更新的順序 */
export function templeTags(videos: readonly Pick<SeriesVideo, 'templeName'>[]): string[] {
  return [...new Set(videos.map((video) => video.templeName))];
}

/**
 * 系列卡片的標籤（使用者 2026-11-05 提出）：影片方向、用過的寺廟（最多 3 個，其餘「+N」）、共同角色（「角色：名稱」）
 */
export const MAX_CARD_TEMPLE_TAGS = 3;

export function seriesCardTags(input: { direction: string; videos: readonly Pick<SeriesVideo, 'templeName'>[]; characters: readonly string[] }): string[] {
  const temples = templeTags(input.videos);
  const shown = temples.slice(0, MAX_CARD_TEMPLE_TAGS);
  const more = temples.length - shown.length;
  return [
    ...(input.direction.trim() ? [input.direction.trim()] : []),
    ...shown,
    ...(more > 0 ? [`+${more}`] : []),
    ...input.characters.map((name) => `角色：${name}`),
  ];
}

/** 影片階段的名稱（05「videos.stage」） */
const STAGE_LABELS: Record<VideoStage, string> = {
  creating: '建立中',
  board_pending: '定裝版待確認',
  chat: '創作對話',
  questionnaire: '設定問卷',
  plan: '分鏡方案',
  frames_generating: '精緻圖生成中',
  frames: '精緻圖',
  video_generating: '影片生成中',
  final: '成品',
  done: '完成',
};

export function videoStageLabel(stage: VideoStage): string {
  return STAGE_LABELS[stage];
}

/**
 * 點影片時前往的頁面（03 路由表）：
 * - creating：建立影片頁（帶 ?video=）
 * - board_pending：寺廟定裝版頁
 * - 其他：創作工作區；有成品（final、done）時打開成品面板
 */
export function videoEntryPath(video: Pick<SeriesVideo, 'id' | 'seriesId' | 'stage'>): string {
  if (video.stage === 'creating') return `/series/${video.seriesId}/videos/new?video=${video.id}`;
  if (video.stage === 'board_pending') return `/videos/${video.id}/temple-board`;
  if (video.stage === 'final' || video.stage === 'done') return `/videos/${video.id}/studio?panel=final`;
  return `/videos/${video.id}/studio`;
}
