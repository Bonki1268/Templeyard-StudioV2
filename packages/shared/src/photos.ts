import { z } from 'zod';
import { viewKeySchema } from './views.js';

// 寺廟照片與去識別（docs/05-Backend-Schema.md「photos」、02「去識別」）。

/** 同系列同一間廟最多幾張寺廟照片（規格書：1～5 張） */
export const MAX_TEMPLE_PHOTOS = 5;

export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type PhotoMime = (typeof PHOTO_MIME_TYPES)[number];

/** 一張照片的 base64 最多約 40MB（原始檔約 30MB） */
const MAX_BASE64_LENGTH = 40 * 1024 * 1024;

/** 以 base64 傳送的圖片 */
export const imageUploadSchema = z.object({
  mime: z.enum(PHOTO_MIME_TYPES, { error: '照片格式要是 JPEG、PNG 或 WebP' }),
  dataBase64: z.base64({ error: '照片資料不是正確的 base64' }).min(1, { error: '照片資料是空的' }).max(MAX_BASE64_LENGTH, {
    error: '照片太大，最多約 30MB',
  }),
});
export type ImageUpload = z.infer<typeof imageUploadSchema>;

const ratio = z.number().min(0, { error: '位置要在照片範圍內' }).max(1, { error: '位置要在照片範圍內' });
const size = z.number().gt(0, { error: '遮蔽框要有大小' }).max(1, { error: '遮蔽框不能比照片大' });

/** 允許的浮點誤差：框的右緣與下緣可以剛好貼齊照片邊緣 */
const EDGE_EPSILON = 1e-6;

/**
 * 遮蔽框：位置與大小以照片寬高的比例表示（0～1）。
 * - source：auto 為人臉偵測找到的，manual 為使用者自己加的
 * - kind：face 臉孔、plate 車牌
 * - cancelled：自動偵測的框被使用者取消（例如誤判神像的臉）；取消的框不遮蔽，但保留紀錄
 */
export const deidBoxSchema = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.enum(['face', 'plate']),
    source: z.enum(['auto', 'manual']),
    x: ratio,
    y: ratio,
    width: size,
    height: size,
    cancelled: z.boolean(),
  })
  .refine((box) => box.x + box.width <= 1 + EDGE_EPSILON && box.y + box.height <= 1 + EDGE_EPSILON, {
    error: '遮蔽框超出照片範圍',
  });
export type DeidBox = z.infer<typeof deidBoxSchema>;

export const deidBoxesSchema = z.array(deidBoxSchema).max(200, { error: '遮蔽框最多 200 個' });

/** POST /api/videos/:id/photos/originals：原圖，只存本機 */
export const uploadOriginalSchema = imageUploadSchema;

/** POST /api/videos/:id/photos：去識別後的照片 */
export const createPhotoSchema = z.object({
  originalAssetId: z.string({ error: '請提供原圖編號' }).min(1, { error: '請提供原圖編號' }),
  deidentified: imageUploadSchema,
  deidBoxes: deidBoxesSchema,
  viewKey: viewKeySchema.nullable().optional(),
});
export type CreatePhotoInput = z.infer<typeof createPhotoSchema>;

/** PATCH /api/videos/:id/photos/:photoId：改視角，或重新遮蔽（去識別圖與遮蔽框一起換） */
export const updatePhotoSchema = z
  .object({
    viewKey: viewKeySchema.nullable(),
    deidentified: imageUploadSchema,
    deidBoxes: deidBoxesSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { error: '沒有要修改的欄位' })
  .refine((value) => (value.deidentified === undefined) === (value.deidBoxes === undefined), {
    error: '重新遮蔽時，去識別後的照片與遮蔽框要一起送出',
  });
export type UpdatePhotoInput = z.infer<typeof updatePhotoSchema>;

export const photoSchema = z.object({
  id: z.string(),
  seriesId: z.string(),
  templeId: z.string(),
  /** 有值代表第 3 步的補充照片，只屬於該影片；寺廟照片為 null */
  videoId: z.string().nullable(),
  originalAssetId: z.string(),
  deidentifiedAssetId: z.string(),
  viewKey: z.string().nullable(),
  deidBoxes: z.array(deidBoxSchema),
  createdAt: z.string(),
});
export type Photo = z.infer<typeof photoSchema>;

export const photoResponseSchema = z.object({ photo: photoSchema });
