import { z } from 'zod';
import { STANDARD_VIEWS, viewKeySchema, type StandardViewKey } from './views.js';

// 寺廟定裝版（docs/05-Backend-Schema.md「temple_boards、temple_board_versions、temple_views」、03「寺廟定裝版」）

/** 確認紀錄的確認點（05「confirmations」） */
export const CONFIRMATION_POINTS = ['temple_board', 'questionnaire', 'plan_generate', 'frames', 'final'] as const;
export type ConfirmationPoint = (typeof CONFIRMATION_POINTS)[number];

/** 光線與時段的選項（設計稿 TempleBoard）；預設晴天午後（規格書「光線與時段」的例子） */
export const TEMPLE_LIGHTING_OPTIONS = ['清晨暖光', '晴天午後', '黃昏', '夜間點燈'] as const;
export type TempleLighting = (typeof TEMPLE_LIGHTING_OPTIONS)[number];
export const DEFAULT_TEMPLE_LIGHTING: TempleLighting = '晴天午後';

export const MAX_APPEARANCE_LOCKS = 10;
export const MAX_APPEARANCE_LOCK_LENGTH = 200;
export const MAX_VIEW_INSTRUCTION_LENGTH = 500;

export const TEMPLE_VIEW_SOURCES = ['photo', 'ai_inferred'] as const;
export type TempleViewSource = (typeof TEMPLE_VIEW_SOURCES)[number];

/** 視角圖目前的狀態：生成中、失敗、已產生 */
export const TEMPLE_VIEW_STATES = ['generating', 'failed', 'ready'] as const;
export type TempleViewState = (typeof TEMPLE_VIEW_STATES)[number];

export const templeViewSchema = z.object({
  id: z.string(),
  viewKey: z.string(),
  viewName: z.string(),
  source: z.enum(TEMPLE_VIEW_SOURCES),
  /** 依照片的視角：第一張對應的照片 */
  photoId: z.string().nullable(),
  /** 目前的視角圖；還沒產生完成時為 null */
  assetId: z.string().nullable(),
  confirmed: z.boolean(),
  state: z.enum(TEMPLE_VIEW_STATES),
  /** 最近一次生成失敗的原因 */
  error: z.string().nullable(),
  /** 最近一次生成的修改指令 */
  lastInstruction: z.string().nullable(),
  createdFromVideoId: z.string().nullable(),
});
export type TempleView = z.infer<typeof templeViewSchema>;

export const templeBoardVersionSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  version: z.number().int().positive(),
  imageModel: z.string(),
  appearanceLocks: z.array(z.string()),
  defaultLighting: z.string(),
  confirmedAt: z.string().nullable(),
});
export type TempleBoardVersion = z.infer<typeof templeBoardVersionSchema>;

/** GET /api/videos/:id/temple-board：這支影片使用的定裝版版本 */
export const templeBoardSchema = z.object({
  boardId: z.string(),
  seriesId: z.string(),
  templeId: z.string(),
  templeName: z.string(),
  videoId: z.string(),
  version: templeBoardVersionSchema,
  views: z.array(templeViewSchema),
  /** 定裝版由不同於這支影片的圖片模型產生（沿用時） */
  otherImageModel: z.boolean(),
  /** 確認前還要處理的事；空陣列表示可以確認 */
  pending: z.array(z.string()),
});
export type TempleBoard = z.infer<typeof templeBoardSchema>;
export const templeBoardResponseSchema = z.object({ board: templeBoardSchema });

/** 建立影片頁顯示的「沿用定裝版」：同系列同一間廟目前確認過的版本 */
export const reusableTempleBoardSchema = z.object({
  versionId: z.string(),
  version: z.number().int().positive(),
  imageModel: z.string(),
  confirmedAt: z.string(),
});
export type ReusableTempleBoard = z.infer<typeof reusableTempleBoardSchema>;

/** POST /api/videos/:id/temple-board/generate */
export const generateTempleBoardSchema = z.object({
  /** 缺少照片、要讓 AI 推測的視角 */
  inferredViewKeys: z.array(viewKeySchema, { error: '定裝版的資料不正確' }).max(STANDARD_VIEWS.length).default([]),
  consentToken: z.string().min(1).optional(),
});
export type GenerateTempleBoardInput = z.input<typeof generateTempleBoardSchema>;

/** POST /api/videos/:id/temple-board/views/:viewKey/regenerate */
export const regenerateTempleViewSchema = z.object({
  instruction: z
    .string({ error: '修改指令要是文字' })
    .trim()
    .max(MAX_VIEW_INSTRUCTION_LENGTH, { error: `修改指令最多 ${MAX_VIEW_INSTRUCTION_LENGTH} 字` })
    .optional(),
  consentToken: z.string().min(1).optional(),
});
export type RegenerateTempleViewInput = z.input<typeof regenerateTempleViewSchema>;

/** PATCH /api/videos/:id/temple-board：外觀規範（連續性鎖）與光線 */
export const updateTempleBoardSchema = z
  .object({
    appearanceLocks: z
      .array(
        z
          .string({ error: '外觀規範要是文字' })
          .trim()
          .min(1, { error: '外觀規範不能是空白' })
          .max(MAX_APPEARANCE_LOCK_LENGTH, { error: `每條外觀規範最多 ${MAX_APPEARANCE_LOCK_LENGTH} 字` }),
      )
      .max(MAX_APPEARANCE_LOCKS, { error: `外觀規範最多 ${MAX_APPEARANCE_LOCKS} 條` }),
    defaultLighting: z.enum(TEMPLE_LIGHTING_OPTIONS, { error: '請從清單選擇光線與時段' }),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { error: '沒有要修改的欄位' });
export type UpdateTempleBoardInput = z.infer<typeof updateTempleBoardSchema>;

/** 要產生的一個視角 */
export type PlannedView = { key: StandardViewKey; name: string; source: TempleViewSource; photoIds: string[] };

export const NO_PHOTO_MESSAGE = '至少要有 1 張去識別後的照片';
export const NO_VIEW_MESSAGE = '沒有可以產生的視角：請在照片指定拍到的視角，或讓 AI 推測缺少的視角';
export const VIEW_PENDING_ITEM = '在照片指定拍到的視角，或讓 AI 推測缺少的視角';
export const BOARD_CONFIRMED_MESSAGE = '這個版本已確認；要修改請先另存新版本';

/**
 * 依照片與使用者選的 AI 推測，決定要產生哪些視角（順序同標準清單）：
 * 有照片的視角依照片；缺少照片、使用者選了讓 AI 推測的視角為 AI 推測；其他缺少的視角不產生。
 * 已有照片的視角即使被選了 AI 推測，仍依照片。
 */
export function planBoardViews(
  photos: readonly { id: string; viewKey: string | null }[],
  inferredViewKeys: readonly StandardViewKey[],
): PlannedView[] {
  const inferred = new Set(inferredViewKeys);
  const planned: PlannedView[] = [];
  for (const view of STANDARD_VIEWS) {
    const photoIds = photos.filter((photo) => photo.viewKey === view.key).map((photo) => photo.id);
    if (photoIds.length > 0) planned.push({ key: view.key, name: view.name, source: 'photo', photoIds });
    else if (inferred.has(view.key)) planned.push({ key: view.key, name: view.name, source: 'ai_inferred', photoIds: [] });
  }
  return planned;
}

/** 確認定裝版前還要處理的事（順序同視角）：生成中、失敗、AI 推測待確認、重生後需重新確認 */
export function boardPendingItems(
  views: readonly Pick<TempleView, 'viewName' | 'source' | 'confirmed' | 'state'>[],
): string[] {
  if (views.length === 0) return [NO_VIEW_MESSAGE];
  return views.flatMap((view) => {
    if (view.state === 'generating') return [`「${view.viewName}」還在生成中`];
    if (view.state === 'failed') return [`「${view.viewName}」生成失敗，請重生`];
    if (view.confirmed) return [];
    return view.source === 'ai_inferred'
      ? [`「${view.viewName}」為 AI 推測，請先確認或補傳照片`]
      : [`「${view.viewName}」重新產生了，請確認這張`];
  });
}

/** 視角圖卡上的標籤：依照片／需重新確認／AI 推測・待確認／AI 推測・已確認 */
export function viewTags(view: Pick<TempleView, 'source' | 'confirmed' | 'state'>): string[] {
  if (view.source === 'ai_inferred') return [view.confirmed ? 'AI 推測・已確認' : 'AI 推測・待確認'];
  // 生成中或失敗時不提示確認：等產生完成再說
  return view.confirmed || view.state !== 'ready' ? ['依照片'] : ['依照片', '需重新確認'];
}
