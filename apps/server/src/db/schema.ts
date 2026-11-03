import { sql } from 'drizzle-orm';
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type {
  AssetKind,
  ConfirmationPoint,
  DeidBox,
  FrameKind,
  GenerationStatus,
  PlanDiff,
  PlanSource,
  QuestionnaireAnswer,
  ShotSize,
  TempleFlag,
  TempleStatus,
  TempleViewSource,
  ToolCallSummary,
  VideoStage,
} from '@templeyard/shared';

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

/** temple_boards：寺廟定裝版；同系列同一間廟只有一份，current_version_id 指向目前確認過的版本 */
export const templeBoards = sqliteTable(
  'temple_boards',
  {
    id: text('id').primaryKey(),
    seriesId: text('series_id')
      .notNull()
      .references(() => series.id),
    // 不設外鍵：pnpm db:import 會整批重建 temples
    templeId: text('temple_id').notNull(),
    currentVersionId: text('current_version_id'),
  },
  (table) => [uniqueIndex('temple_boards_series_temple_uq').on(table.seriesId, table.templeId)],
);

export type TempleBoardRow = typeof templeBoards.$inferSelect;

/** temple_board_versions：定裝版的版本；另存新版本時新增一列，確認後不再修改 */
export const templeBoardVersions = sqliteTable(
  'temple_board_versions',
  {
    id: text('id').primaryKey(),
    boardId: text('board_id')
      .notNull()
      .references(() => templeBoards.id),
    version: integer('version').notNull(),
    imageModel: text('image_model').notNull(),
    appearanceLocks: text('appearance_locks', { mode: 'json' }).$type<string[]>().notNull(),
    defaultLighting: text('default_lighting').notNull(),
    confirmedAt: text('confirmed_at'),
  },
  (table) => [uniqueIndex('temple_board_versions_board_version_uq').on(table.boardId, table.version)],
);

export type TempleBoardVersionRow = typeof templeBoardVersions.$inferSelect;

/** temple_views：某一版定裝版的一張視角圖；補充視角也是一列 */
export const templeViews = sqliteTable(
  'temple_views',
  {
    id: text('id').primaryKey(),
    boardVersionId: text('board_version_id')
      .notNull()
      .references(() => templeBoardVersions.id),
    viewKey: text('view_key').notNull(),
    viewName: text('view_name').notNull(),
    source: text('source').$type<TempleViewSource>().notNull(),
    photoId: text('photo_id').references(() => photos.id),
    assetId: text('asset_id').references(() => assets.id),
    confirmed: integer('confirmed', { mode: 'boolean' }).notNull().default(false),
    createdFromVideoId: text('created_from_video_id').references(() => videos.id),
  },
  (table) => [uniqueIndex('temple_views_version_view_uq').on(table.boardVersionId, table.viewKey)],
);

export type TempleViewRow = typeof templeViews.$inferSelect;

/** confirmations：確認紀錄；失效時寫 invalidated_at，不刪除 */
export const confirmations = sqliteTable(
  'confirmations',
  {
    id: text('id').primaryKey(),
    videoId: text('video_id')
      .notNull()
      .references(() => videos.id),
    point: text('point').$type<ConfirmationPoint>().notNull(),
    contentRef: text('content_ref', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    confirmedAt: text('confirmed_at').notNull(),
    invalidatedAt: text('invalidated_at'),
  },
  (table) => [index('confirmations_video_idx').on(table.videoId)],
);

export type ConfirmationRow = typeof confirmations.$inferSelect;

/** chat_messages：對話紀錄（scope 為 shot 時 shot_key 指向那一格；第 6 階段只有 video） */
export const chatMessages = sqliteTable(
  'chat_messages',
  {
    id: text('id').primaryKey(),
    videoId: text('video_id')
      .notNull()
      .references(() => videos.id),
    scope: text('scope').$type<'video' | 'shot'>().notNull(),
    shotKey: text('shot_key'),
    role: text('role').$type<'user' | 'agent'>().notNull(),
    content: text('content').notNull(),
    // Agent 執行的操作與結果摘要
    toolCalls: text('tool_calls', { mode: 'json' }).$type<ToolCallSummary[]>().notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('chat_messages_video_idx').on(table.videoId)],
);

export type ChatMessageRow = typeof chatMessages.$inferSelect;

/** questionnaires：問卷，一支影片一份 */
export const questionnaires = sqliteTable(
  'questionnaires',
  {
    id: text('id').primaryKey(),
    videoId: text('video_id')
      .notNull()
      .references(() => videos.id),
    answers: text('answers', { mode: 'json' }).$type<QuestionnaireAnswer[]>().notNull(),
    submittedAt: text('submitted_at'),
  },
  (table) => [uniqueIndex('questionnaires_video_idx').on(table.videoId)],
);

export type QuestionnaireRow = typeof questionnaires.$inferSelect;

/** ai_assist_logs：AI 輔助撰寫紀錄；系列表單還沒建立系列時 series_id 是 null */
export const aiAssistLogs = sqliteTable(
  'ai_assist_logs',
  {
    id: text('id').primaryKey(),
    seriesId: text('series_id').references(() => series.id),
    videoId: text('video_id').references(() => videos.id),
    field: text('field').notNull(),
    userInput: text('user_input').notNull(),
    suggestion: text('suggestion').notNull(),
    adopted: integer('adopted', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('ai_assist_logs_video_idx').on(table.videoId)],
);

export type AiAssistLogRow = typeof aiAssistLogs.$inferSelect;

/** plans：分鏡方案；每次修改新增一列，最新版為現行方案 */
export const plans = sqliteTable(
  'plans',
  {
    id: text('id').primaryKey(),
    videoId: text('video_id')
      .notNull()
      .references(() => videos.id),
    version: integer('version').notNull(),
    styleNote: text('style_note').notNull(),
    source: text('source').$type<PlanSource>().notNull(),
    diff: text('diff', { mode: 'json' }).$type<PlanDiff>().notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('plans_video_version_idx').on(table.videoId, table.version)],
);

export type PlanRow = typeof plans.$inferSelect;

/** shots：某一版方案中的一格；shot_key 跨版本不變 */
export const shots = sqliteTable(
  'shots',
  {
    id: text('id').primaryKey(),
    planId: text('plan_id')
      .notNull()
      .references(() => plans.id),
    shotKey: text('shot_key').notNull(),
    seq: integer('seq').notNull(),
    startSec: integer('start_sec').notNull(),
    durationSec: integer('duration_sec').notNull(),
    shotSize: text('shot_size').$type<ShotSize>().notNull(),
    cameraMove: text('camera_move').notNull(),
    cameraSpeed: text('camera_speed').notNull(),
    cameraAngle: text('camera_angle').notNull(),
    description: text('description').notNull(),
    actionStart: text('action_start').notNull(),
    actionEnd: text('action_end').notNull(),
    viewKey: text('view_key').notNull(),
    lighting: text('lighting').notNull(),
    // 第 7 階段先存角色名稱；第 8 階段建立 characters 後改存角色編號
    characterIds: text('character_ids', { mode: 'json' }).$type<string[]>().notNull(),
    dialogue: text('dialogue').notNull(),
    speaker: text('speaker').notNull(),
    subtitle: text('subtitle').notNull(),
    photoId: text('photo_id'),
    keyframesEnabled: integer('keyframes_enabled', { mode: 'boolean' }).notNull().default(false),
    keyframeTimes: text('keyframe_times', { mode: 'json' }).$type<number[]>().notNull(),
    customPrompt: text('custom_prompt'),
    factSources: text('fact_sources', { mode: 'json' }).$type<string[]>().notNull(),
    dialogueEstimateSec: real('dialogue_estimate_sec'),
    // 第 11 階段：細修頁的生成設定；null 表示沒有設定過（使用原生語音、1 張候選圖）
    nativeVoice: integer('native_voice', { mode: 'boolean' }),
    candidateCount: integer('candidate_count'),
  },
  (table) => [index('shots_plan_idx').on(table.planId), index('shots_key_idx').on(table.shotKey)],
);

export type ShotRow = typeof shots.$inferSelect;

/** characters：角色；系列角色有 series_id，影片專屬角色有 video_id */
export const characters = sqliteTable(
  'characters',
  {
    id: text('id').primaryKey(),
    seriesId: text('series_id').references(() => series.id),
    videoId: text('video_id').references(() => videos.id),
    name: text('name').notNull(),
    isSeries: integer('is_series', { mode: 'boolean' }).notNull().default(false),
    currentVersionId: text('current_version_id'),
  },
  (table) => [index('characters_series_idx').on(table.seriesId), index('characters_video_idx').on(table.videoId)],
);

export type CharacterRow = typeof characters.$inferSelect;

/** character_versions：角色的版本；確認後鎖定，後續生成都使用這個版本 */
export const characterVersions = sqliteTable(
  'character_versions',
  {
    id: text('id').primaryKey(),
    characterId: text('character_id')
      .notNull()
      .references(() => characters.id),
    version: integer('version').notNull(),
    description: text('description').notNull(),
    continuityLocks: text('continuity_locks', { mode: 'json' }).$type<string[]>().notNull(),
    sheetAssetId: text('sheet_asset_id').references(() => assets.id),
    lookAssetId: text('look_asset_id').references(() => assets.id),
    imageModel: text('image_model').notNull(),
    confirmedAt: text('confirmed_at'),
  },
  (table) => [uniqueIndex('character_versions_character_version_uq').on(table.characterId, table.version)],
);

export type CharacterVersionRow = typeof characterVersions.$inferSelect;

/** frames：精緻圖與關鍵畫格；based_on 記下產生時依據的版本（用來判斷失效） */
export const frames = sqliteTable(
  'frames',
  {
    id: text('id').primaryKey(),
    videoId: text('video_id')
      .notNull()
      .references(() => videos.id),
    shotKey: text('shot_key').notNull(),
    kind: text('kind').$type<FrameKind>().notNull(),
    atSec: real('at_sec'),
    assetId: text('asset_id').references(() => assets.id),
    generationId: text('generation_id').references(() => generations.id),
    userUploaded: integer('user_uploaded', { mode: 'boolean' }).notNull().default(false),
    editOfFrameId: text('edit_of_frame_id'),
    selected: integer('selected', { mode: 'boolean' }).notNull().default(false),
    basedOn: text('based_on', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    needsReconfirm: integer('needs_reconfirm', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('frames_video_shot_idx').on(table.videoId, table.shotKey)],
);

export type FrameRow = typeof frames.$inferSelect;

// ── 第 11 階段：分鏡影片與成品（05「clips、finals」） ──

export type KeyframeSimilarityRow = { atSec: number; score: number };

export const clips = sqliteTable(
  'clips',
  {
    id: text('id').primaryKey(),
    videoId: text('video_id')
      .notNull()
      .references(() => videos.id),
    shotKey: text('shot_key').notNull(),
    assetId: text('asset_id').references(() => assets.id),
    generationId: text('generation_id').references(() => generations.id),
    selected: integer('selected', { mode: 'boolean' }).notNull().default(false),
    keyframeSimilarity: text('keyframe_similarity', { mode: 'json' }).$type<KeyframeSimilarityRow[]>().notNull(),
    basedOn: text('based_on', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    needsReconfirm: integer('needs_reconfirm', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('clips_video_shot_idx').on(table.videoId, table.shotKey)],
);

export type ClipRow = typeof clips.$inferSelect;

export const finals = sqliteTable('finals', {
  id: text('id').primaryKey(),
  videoId: text('video_id')
    .notNull()
    .references(() => videos.id),
  assetId: text('asset_id')
    .notNull()
    .references(() => assets.id),
  clipIds: text('clip_ids', { mode: 'json' }).$type<string[]>().notNull(),
  subtitleAssetId: text('subtitle_asset_id').references(() => assets.id),
  createdAt: text('created_at').notNull(),
});

export type FinalRow = typeof finals.$inferSelect;
