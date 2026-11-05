import { z } from 'zod';
import { questionnaireDefaultsSchema } from './questionnaire.js';

// 影片建立時保存的系列設定（05 videos.series_snapshot）：之後這支影片的生成讀這份，不讀系列的即時值

export const seriesSnapshotSchema = z.object({
  visualStyle: z.string(),
  direction: z.string(),
  defaultImageModel: z.string(),
  defaultVideoModel: z.string(),
  questionnaireDefaults: questionnaireDefaultsSchema.nullable(),
});
export type SeriesSnapshot = z.infer<typeof seriesSnapshotSchema>;

type SeriesLike = {
  visualStyle: string;
  direction: string;
  defaultImageModel: string;
  defaultVideoModel: string;
  questionnaireDefaults: Record<string, unknown> | null;
};

/** 影片建立時，從系列目前的設定做一份快照 */
export function makeSeriesSnapshot(_series: SeriesLike): SeriesSnapshot {
  throw new Error('尚未實作：makeSeriesSnapshot');
}

/** 這支影片用的系列設定：有格式正確的快照用快照，否則（舊資料）用系列目前的設定 */
export function seriesSettingsOf(_snapshot: unknown, _live: SeriesLike): SeriesSnapshot {
  throw new Error('尚未實作：seriesSettingsOf');
}
