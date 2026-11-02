import { z } from 'zod';
import { costLimitSchema } from './costs.js';
import { IMAGE_MODEL_KEYS, VIDEO_MODEL_KEYS } from './models.js';
import { photoSchema } from './photos.js';
import { templeSummarySchema } from './temples.js';

// 影片（docs/05-Backend-Schema.md「videos」）

export const VIDEO_STAGES = [
  'creating',
  'board_pending',
  'chat',
  'questionnaire',
  'plan',
  'frames_generating',
  'frames',
  'video_generating',
  'final',
  'done',
] as const;
export type VideoStage = (typeof VIDEO_STAGES)[number];

export const MAX_TEMPLE_NOTES_LENGTH = 5000;

/** POST /api/videos：選定寺廟時建立影片草稿；模型帶入系列預設 */
export const createVideoSchema = z.object({
  seriesId: z.string({ error: '請提供系列編號' }).min(1, { error: '請提供系列編號' }),
  templeId: z.string({ error: '請選擇寺廟' }).min(1, { error: '請選擇寺廟' }),
});
export type CreateVideoInput = z.infer<typeof createVideoSchema>;

/** PATCH /api/videos/:id：重新選寺廟、選模型、寺廟歷史與簡介 */
export const updateVideoSchema = z
  .object({
    templeId: z.string().min(1, { error: '請選擇寺廟' }),
    imageModel: z.enum(IMAGE_MODEL_KEYS, { error: '請從清單選擇圖片模型' }),
    videoModel: z.enum(VIDEO_MODEL_KEYS, { error: '請從清單選擇影片模型' }),
    userTempleNotes: z
      .string({ error: '寺廟歷史與簡介要是文字' })
      .max(MAX_TEMPLE_NOTES_LENGTH, { error: `寺廟歷史與簡介最多 ${MAX_TEMPLE_NOTES_LENGTH} 字` }),
    /** 本支影片的費用上限（點數）；null 表示不設上限 */
    costLimit: costLimitSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { error: '沒有要修改的欄位' });
export type UpdateVideoInput = z.infer<typeof updateVideoSchema>;

export const videoSchema = z.object({
  id: z.string(),
  seriesId: z.string(),
  templeId: z.string(),
  stage: z.enum(VIDEO_STAGES),
  imageModel: z.string(),
  videoModel: z.string(),
  /** 產生寺廟定裝版時寫入（第 5 階段）；有值後兩個模型不能再改 */
  modelsLockedAt: z.string().nullable(),
  /** 使用者貼上的寺廟歷史與簡介；來源標示「使用者提供」 */
  userTempleNotes: z.string(),
  /** 本支影片的費用上限（點數）；null 表示不設上限 */
  costLimit: z.number().int().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Video = z.infer<typeof videoSchema>;

export const videoResponseSchema = z.object({ video: videoSchema });

/** GET /api/videos/:id：影片、寺廟資料卡、這間廟的照片 */
export const videoDetailResponseSchema = z.object({
  video: videoSchema,
  temple: templeSummarySchema,
  photos: z.array(photoSchema),
});
export type VideoDetail = z.infer<typeof videoDetailResponseSchema>;
