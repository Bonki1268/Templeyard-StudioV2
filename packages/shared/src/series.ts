import { z } from 'zod';
import { IMAGE_MODEL_KEYS, VIDEO_MODEL_KEYS } from './models.js';

// 系列專案（docs/05-Backend-Schema.md「series」）

/** 影片方向的選項；也可以自己寫 */
export const SERIES_DIRECTIONS = ['歷史故事', '節慶宣傳', '景點導覽', '人物代言'] as const;

/** 影片秒數的選項（≤ 30） */
export const SERIES_DURATIONS = [15, 20, 30] as const;
export const DEFAULT_SERIES_DURATION = 30;
export const MAX_SERIES_DURATION = 30;

const DURATION_ERROR = `影片秒數要在 1～${MAX_SERIES_DURATION} 秒之間`;

const seriesFields = {
  name: z
    .string({ error: '請填寫系列名稱' })
    .trim()
    .min(1, { error: '請填寫系列名稱' })
    .max(40, { error: '系列名稱最多 40 字' }),
  visualStyle: z
    .string({ error: '請填寫整體視覺風格' })
    .trim()
    .min(1, { error: '請填寫整體視覺風格' })
    .max(500, { error: '整體視覺風格最多 500 字' }),
  durationSec: z
    .number({ error: DURATION_ERROR })
    .int({ error: DURATION_ERROR })
    .min(1, { error: DURATION_ERROR })
    .max(MAX_SERIES_DURATION, { error: DURATION_ERROR }),
  direction: z
    .string({ error: '請選擇或填寫影片方向' })
    .trim()
    .min(1, { error: '請選擇或填寫影片方向' })
    .max(20, { error: '影片方向最多 20 字' }),
  defaultImageModel: z.enum(IMAGE_MODEL_KEYS, { error: '請從清單選擇圖片模型' }),
  defaultVideoModel: z.enum(VIDEO_MODEL_KEYS, { error: '請從清單選擇影片模型' }),
};

/** POST /api/series */
export const createSeriesSchema = z.object(seriesFields);
export type CreateSeriesInput = z.infer<typeof createSeriesSchema>;

/** PATCH /api/series/:id：只改有傳的欄位 */
export const updateSeriesSchema = z
  .object(seriesFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, { error: '沒有要修改的欄位' });
export type UpdateSeriesInput = z.infer<typeof updateSeriesSchema>;

export const seriesSchema = z.object({
  id: z.string(),
  name: z.string(),
  visualStyle: z.string(),
  durationSec: z.number().int(),
  direction: z.string(),
  defaultImageModel: z.string(),
  defaultVideoModel: z.string(),
  /** 問卷預設值：第一支影片送出問卷後才有（第 6 階段） */
  questionnaireDefaults: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Series = z.infer<typeof seriesSchema>;

export const seriesListResponseSchema = z.object({ series: z.array(seriesSchema) });
export const seriesResponseSchema = z.object({ series: seriesSchema });
