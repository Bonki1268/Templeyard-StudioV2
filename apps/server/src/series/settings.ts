import { makeSeriesSnapshot, seriesSettingsOf, type SeriesSnapshot, type Video } from '@templeyard/shared';
import type { AppDatabase } from '../db/client.js';
import { findSeries } from './repository.js';

// 影片使用的系列設定（第 14 階段）：建立影片時保存了一份，之後這支影片的生成讀這份，
// 不讀系列的即時值（「修改只影響之後新增的影片」）；舊資料沒有快照時才讀系列目前的設定

export type VideoSeriesSettings = SeriesSnapshot & { name: string };

/** 這支影片用的系列設定；找不到系列時回傳 null */
export function seriesSettingsForVideo(db: AppDatabase, video: Pick<Video, 'seriesId' | 'seriesSnapshot'>): VideoSeriesSettings | null {
  const live = findSeries(db, video.seriesId);
  if (!live) return null;
  return { name: live.name, ...seriesSettingsOf(video.seriesSnapshot, live) };
}

/** 系列目前的設定（還沒有影片時，例如系列角色庫） */
export function liveSeriesSettings(db: AppDatabase, seriesId: string): VideoSeriesSettings | null {
  const live = findSeries(db, seriesId);
  return live ? { name: live.name, ...makeSeriesSnapshot(live) } : null;
}
