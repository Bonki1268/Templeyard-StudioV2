import { z } from 'zod';
import { costLimitSchema } from './costs.js';
import { IMAGE_MODEL_KEYS, VIDEO_MODEL_KEYS } from './models.js';
import { photoSchema } from './photos.js';
import { seriesSnapshotSchema } from './seriesSnapshot.js';
import { reusableTempleBoardSchema } from './templeBoards.js';
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
  /** 這支影片使用的寺廟定裝版版本 */
  templeBoardVersionId: z.string().nullable().default(null),
  /** 使用者貼上的寺廟歷史與簡介；來源標示「使用者提供」 */
  userTempleNotes: z.string(),
  /** 創作首頁送出的第一句話（第 6 階段） */
  creativeInput: z.string().nullable().default(null),
  /** 本支影片的費用上限（點數）；null 表示不設上限 */
  costLimit: z.number().int().nullable(),
  /** 複製來源（第 12 階段）；不是複製的影片為 null */
  copiedFromVideoId: z.string().nullable().default(null),
  /** 建立影片時保存的系列設定（第 14 階段）；舊資料補上建立當下可取得的設定，仍可能為 null */
  seriesSnapshot: seriesSnapshotSchema.nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Video = z.infer<typeof videoSchema>;

/** 模型鎖定後更換模型的錯誤訊息 */
export const MODELS_LOCKED_MESSAGE = '模型已在產生寺廟定裝版時鎖定，不能更換';
export const TEMPLE_LOCKED_MESSAGE = '已產生寺廟定裝版，不能更換寺廟';

export const videoResponseSchema = z.object({ video: videoSchema });

/** GET /api/videos/:id：影片、寺廟資料卡、這間廟的照片、可以沿用的定裝版 */
export const videoDetailResponseSchema = z.object({
  video: videoSchema,
  temple: templeSummarySchema,
  photos: z.array(photoSchema),
  /** 同系列同一間廟目前確認過的定裝版；這支影片還沒有定裝版時才有值 */
  reusableBoard: reusableTempleBoardSchema.nullable().default(null),
});
export type VideoDetail = z.infer<typeof videoDetailResponseSchema>;
