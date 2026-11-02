import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { AssetKind, DeidBox, GenerationStatus, TempleFlag, TempleStatus, VideoStage } from '@templeyard/shared';

// 資料表依 docs/05-Backend-Schema.md

/** temples：由 data/temples.csv 匯入，執行期間只讀 */
export const temples = sqliteTable(
  'temples',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    nameNormalized: text('name_normalized').notNull(),
    flags: text('flags', { mode: 'json' }).$type<TempleFlag[]>().notNull(),
    status: text('status').$type<TempleStatus>().notNull(),
    district: text('district').notNull(),
    village: text('village'),
    address: text('address').notNull(),
    phone: text('phone'),
    phoneRaw: text('phone_raw').notNull(),
    deity: text('deity').notNull(),
    religion: text('religion').notNull(),
    foundedYear: integer('founded_year'),
    foundedRaw: text('founded_raw').notNull(),
    rebuiltYear: integer('rebuilt_year'),
    rebuiltRaw: text('rebuilt_raw').notNull(),
  },
  (table) => [
    index('temples_name_normalized_idx').on(table.nameNormalized),
    index('temples_district_idx').on(table.district),
    index('temples_deity_idx').on(table.deity),
  ],
);

export type TempleRow = typeof temples.$inferSelect;
export type NewTempleRow = typeof temples.$inferInsert;

/** series：系列專案 */
export const series = sqliteTable('series', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  visualStyle: text('visual_style').notNull(),
  durationSec: integer('duration_sec').notNull(),
  direction: text('direction').notNull(),
  defaultImageModel: text('default_image_model').notNull(),
  defaultVideoModel: text('default_video_model').notNull(),
  questionnaireDefaults: text('questionnaire_defaults', { mode: 'json' }).$type<Record<string, unknown> | null>(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type SeriesRow = typeof series.$inferSelect;

/** videos：影片；模型在產生寺廟定裝版時鎖定（models_locked_at） */
export const videos = sqliteTable(
  'videos',
  {
    id: text('id').primaryKey(),
    seriesId: text('series_id')
      .notNull()
      .references(() => series.id),
    // 不設外鍵：pnpm db:import 會整批重建 temples（id 是原始資料的固定 UUID）
    templeId: text('temple_id').notNull(),
    stage: text('stage').$type<VideoStage>().notNull(),
    imageModel: text('image_model').notNull(),
    videoModel: text('video_model').notNull(),
    modelsLockedAt: text('models_locked_at'),
    // 第 5 階段建立 temple_board_versions 後才有值
    templeBoardVersionId: text('temple_board_version_id'),
    onePass: integer('one_pass').notNull().default(0),
    userTempleNotes: text('user_temple_notes').notNull().default(''),
    creativeInput: text('creative_input'),
    costLimit: integer('cost_limit'),
    copiedFromVideoId: text('copied_from_video_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('videos_series_idx').on(table.seriesId)],
);

export type VideoRow = typeof videos.$inferSelect;

/** assets：檔案；資料庫只存 data/assets/ 下的相對路徑 */
export const assets = sqliteTable(
  'assets',
  {
    id: text('id').primaryKey(),
    kind: text('kind').$type<AssetKind>().notNull(),
    path: text('path').notNull(),
    mime: text('mime').notNull(),
    width: integer('width'),
    height: integer('height'),
    durationSec: integer('duration_sec'),
    sha256: text('sha256').notNull(),
    cloudOk: integer('cloud_ok', { mode: 'boolean' }).notNull(),
  },
  // 原圖永遠不能送往雲端：資料庫層再擋一次
  (table) => [check('assets_original_never_cloud', sql`${table.kind} <> 'original_photo' OR ${table.cloudOk} = 0`)],
);

export type AssetRow = typeof assets.$inferSelect;

/** photos：寺廟照片（系列中的一間廟）與第 3 步的補充照片（video_id 有值） */
export const photos = sqliteTable(
  'photos',
  {
    id: text('id').primaryKey(),
    seriesId: text('series_id')
      .notNull()
      .references(() => series.id),
    // 不設外鍵：pnpm db:import 會整批重建 temples（id 是原始資料的固定 UUID）
    templeId: text('temple_id').notNull(),
    videoId: text('video_id').references(() => videos.id),
    originalAssetId: text('original_asset_id')
      .notNull()
      .references(() => assets.id),
    deidentifiedAssetId: text('deidentified_asset_id')
      .notNull()
      .references(() => assets.id),
    viewKey: text('view_key'),
    deidBoxes: text('deid_boxes', { mode: 'json' }).$type<DeidBox[]>().notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('photos_series_temple_idx').on(table.seriesId, table.templeId)],
);

export type PhotoRow = typeof photos.$inferSelect;

/** generations：每次 AI 生成一筆（含 Claude 呼叫）；拿到 prompt_id 立刻寫入，重啟時據此取回 */
export const generations = sqliteTable(
  'generations',
  {
    id: text('id').primaryKey(),
    videoId: text('video_id').references(() => videos.id),
    node: text('node').notNull(),
    target: text('target', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    promptIdRef: text('prompt_id_ref'),
    promptVersion: integer('prompt_version'),
    mcpTool: text('mcp_tool').notNull(),
    model: text('model').notNull(),
    callConfigVersion: integer('call_config_version'),
    providerTaskId: text('provider_task_id'),
    confirmRequired: integer('confirm_required', { mode: 'boolean' }).notNull().default(false),
    confirmMessage: text('confirm_message'),
    status: text('status').$type<GenerationStatus>().notNull(),
    // 組裝後的指令與參數（不含金鑰）
    input: text('input', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    userInstruction: text('user_instruction'),
    estimatedCost: integer('estimated_cost'),
    reservedCost: integer('reserved_cost').notNull().default(0),
    actualCost: integer('actual_cost'),
    error: text('error'),
    createdAt: text('created_at').notNull(),
    finishedAt: text('finished_at'),
  },
  (table) => [index('generations_status_idx').on(table.status)],
);

export type GenerationRow = typeof generations.$inferSelect;

/** settings：系統設定（例如單筆同意門檻）；value 為 JSON */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).$type<unknown>(),
});
