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

function parseOption<T extends string>(options: readonly T[], fallback: T, value: string | undefined): T | null {
  if (value === undefined) return fallback;
  return (options as readonly string[]).includes(value) ? (value as T) : null;
}

/** 查詢參數：沒傳用預設（all／updated）；不在清單回傳 null */
export function parseVideoFilter(value: string | undefined): VideoFilter | null {
  return parseOption(VIDEO_FILTERS, 'all', value);
}

export function parseVideoSort(value: string | undefined): VideoSort | null {
  return parseOption(VIDEO_SORTS, 'updated', value);
}

const MAX_STORY_LENGTH = 16;

/** 影片標題：寺廟名稱，有想講的故事時接在後面（超過 16 字截斷加「…」） */
export function videoTitle(templeName: string, creativeInput: string | null): string {
  const story = (creativeInput ?? '').replace(/\s+/g, ' ').trim();
  if (!story) return templeName;
  const shown = story.length > MAX_STORY_LENGTH ? `${[...story].slice(0, MAX_STORY_LENGTH).join('')}…` : story;
  return `${templeName}：${shown}`;
}

const STAGE_STATUS: Record<VideoStage, string> = {
  creating: '建立中',
  board_pending: '寺廟定裝版待確認',
  chat: '創作對話',
  questionnaire: '設定問卷',
  plan: '分鏡方案',
  frames_generating: '精緻圖生成中',
  frames: '精緻圖',
  video_generating: '影片生成中',
  final: '成品待確認',
  done: '完成',
};

/** 狀態標籤與分組（只有 done 階段算「完成」） */
export function videoStatus(input: { stage: VideoStage; staleFrames: number; staleClips: number }): { label: string; group: 'wip' | 'done' } {
  const { stage } = input;
  if (stage === 'done') return { label: STAGE_STATUS.done, group: 'done' };
  if (stage === 'frames' && input.staleFrames > 0) return { label: `精緻圖・${input.staleFrames} 格需重新確認`, group: 'wip' };
  if (stage === 'final' && input.staleClips > 0) return { label: `成品・${input.staleClips} 格需重新確認`, group: 'wip' };
  return { label: STAGE_STATUS[stage], group: 'wip' };
}

export function filterVideos<T extends { group: 'wip' | 'done' }>(videos: readonly T[], filter: VideoFilter): T[] {
  return filter === 'all' ? [...videos] : videos.filter((video) => video.group === filter);
}

export function videoCounts(videos: readonly { group: 'wip' | 'done' }[]): Record<VideoFilter, number> {
  const wip = videos.filter((video) => video.group === 'wip').length;
  return { all: videos.length, wip, done: videos.length - wip };
}

function compareDesc(a: string, b: string): number {
  return a < b ? 1 : a > b ? -1 : 0;
}

/** 最近更新、建立時間：新的在前；寺廟名稱：依字元順序；同樣時依編號，結果固定 */
export function sortVideos<T extends { id: string; templeName: string; createdAt: string; updatedAt: string }>(videos: readonly T[], sort: VideoSort): T[] {
  const primary = (a: T, b: T): number => {
    if (sort === 'updated') return compareDesc(a.updatedAt, b.updatedAt);
    if (sort === 'created') return compareDesc(a.createdAt, b.createdAt);
    return a.templeName < b.templeName ? -1 : a.templeName > b.templeName ? 1 : 0;
  };
  return [...videos].sort((a, b) => primary(a, b) || compareDesc(a.id, b.id));
}

/** 成品長度「0:28」 */
export function formatDuration(sec: number): string {
  const total = Math.max(0, Math.round(sec));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
