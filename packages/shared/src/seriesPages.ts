import type { VideoStage } from './videos.js';

// 系列頁「過去的影片」分頁（03 系列頁、設計稿 Videos）：篩選、排序、狀態細節

export const VIDEO_FILTERS = ['all', 'wip', 'done'] as const;
export type VideoFilter = (typeof VIDEO_FILTERS)[number];
export const VIDEO_FILTER_LABELS: Record<VideoFilter, string> = { all: '全部', wip: '製作中', done: '完成' };

export const VIDEO_SORTS = ['updated', 'created', 'temple'] as const;
export type VideoSort = (typeof VIDEO_SORTS)[number];
export const VIDEO_SORT_LABELS: Record<VideoSort, string> = { updated: '最近更新', created: '建立時間', temple: '寺廟名稱' };

/** 影片卡需要的欄位（GET /api/series/:id/videos 的每一筆） */
export type SeriesVideoCardData = {
  id: string;
  seriesId: string;
  stage: VideoStage;
  templeName: string;
  district: string;
  title: string;
  imageModel: string;
  videoModel: string;
  /** 狀態標籤，含細節（例如「精緻圖・2 格需重新確認」） */
  statusLabel: string;
  group: 'wip' | 'done';
  finalDurationSec: number | null;
  thumbnailAssetId: string | null;
  createdAt: string;
  updatedAt: string;
  /** 系列問卷預設值來自這支影片 */
  isDefaultsSource: boolean;
};

/** 查詢參數：沒傳用預設（all／updated）；不在清單回傳 null */
export function parseVideoFilter(_value: string | undefined): VideoFilter | null {
  throw new Error('尚未實作：parseVideoFilter');
}

export function parseVideoSort(_value: string | undefined): VideoSort | null {
  throw new Error('尚未實作：parseVideoSort');
}

/** 影片標題：寺廟名稱，有想講的故事時接在後面（超過 16 字截斷加「…」） */
export function videoTitle(_templeName: string, _creativeInput: string | null): string {
  throw new Error('尚未實作：videoTitle');
}

/** 狀態標籤與分組（只有 done 階段算「完成」） */
export function videoStatus(_input: { stage: VideoStage; staleFrames: number; staleClips: number }): { label: string; group: 'wip' | 'done' } {
  throw new Error('尚未實作：videoStatus');
}

export function filterVideos<T extends { group: 'wip' | 'done' }>(_videos: readonly T[], _filter: VideoFilter): T[] {
  throw new Error('尚未實作：filterVideos');
}

export function videoCounts(_videos: readonly { group: 'wip' | 'done' }[]): Record<VideoFilter, number> {
  throw new Error('尚未實作：videoCounts');
}

/** 最近更新、建立時間：新的在前；寺廟名稱：依字元順序；同樣時依編號，結果固定 */
export function sortVideos<T extends { id: string; templeName: string; createdAt: string; updatedAt: string }>(_videos: readonly T[], _sort: VideoSort): T[] {
  throw new Error('尚未實作：sortVideos');
}

/** 成品長度「0:28」 */
export function formatDuration(_sec: number): string {
  throw new Error('尚未實作：formatDuration');
}
