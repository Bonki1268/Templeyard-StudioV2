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

function readDefaults(value: unknown): SeriesSnapshot['questionnaireDefaults'] {
  const parsed = questionnaireDefaultsSchema.safeParse(value);
  return parsed.success ? structuredClone(parsed.data) : null;
}

/** 影片建立時，從系列目前的設定做一份快照（問卷預設值格式不正確時當成沒有） */
export function makeSeriesSnapshot(series: SeriesLike): SeriesSnapshot {
  return {
    visualStyle: series.visualStyle,
    direction: series.direction,
    defaultImageModel: series.defaultImageModel,
    defaultVideoModel: series.defaultVideoModel,
    questionnaireDefaults: readDefaults(series.questionnaireDefaults),
  };
}

/** 這支影片用的系列設定：有格式正確的快照用快照，否則（舊資料）用系列目前的設定 */
export function seriesSettingsOf(snapshot: unknown, live: SeriesLike): SeriesSnapshot {
  const parsed = seriesSnapshotSchema.safeParse(snapshot);
  return parsed.success ? parsed.data : makeSeriesSnapshot(live);
}
