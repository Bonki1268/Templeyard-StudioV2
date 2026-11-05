import { z } from 'zod';

// 角色定裝版（01 F10、05 characters、character_versions、規格書「角色」）

export const CHARACTER_STATES = ['draft', 'generating', 'pending_confirm', 'confirmed', 'failed'] as const;
export type CharacterState = (typeof CHARACTER_STATES)[number];

/** 角色卡上的狀態標籤 */
export const CHARACTER_STATE_LABELS: Record<CharacterState, string> = {
  draft: '待產生定裝圖',
  generating: '生成中',
  pending_confirm: '待確認',
  confirmed: '已確認',
  failed: '生成失敗',
};

export const characterVersionSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  description: z.string(),
  /** 身份錨點與造型分開編輯；外觀描述由兩者組成。舊資料沒有，為 null（第 14 階段） */
  identityAnchors: z.string().nullable().default(null),
  look: z.string().nullable().default(null),
  /** 和上一版的差別說明；第 1 版沒有 */
  changeNote: z.string().nullable().default(null),
  continuityLocks: z.array(z.string()),
  sheetAssetId: z.string().nullable(),
  lookAssetId: z.string().nullable(),
  imageModel: z.string(),
  confirmedAt: z.string().nullable(),
});
export type CharacterVersion = z.infer<typeof characterVersionSchema>;

export const characterSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** 系列角色：同系列的影片都能沿用 */
  isSeries: z.boolean(),
  seriesId: z.string().nullable(),
  videoId: z.string().nullable(),
  version: characterVersionSchema,
  state: z.enum(CHARACTER_STATES),
  /** 最近一次生成失敗的原因 */
  error: z.string().nullable(),
});
export type Character = z.infer<typeof characterSchema>;

export const characterResponseSchema = z.object({ character: characterSchema });
export const characterListResponseSchema = z.object({ characters: z.array(characterSchema) });

export const MAX_CONTINUITY_LOCKS = 10;

/**
 * PATCH /api/characters/:id：外觀（身份錨點與造型，或整段外觀描述）與連續性鎖
 * （已確認的版本會另存新版本，要重新產生定裝圖）。第 14 階段起分開編輯身份錨點與造型，外觀描述由兩者組成；
 * 沒有傳 description 時用 identityAnchors 與 look 組成
 */
export const updateCharacterSchema = z.object({
  description: z.string({ error: '請填寫角色的外觀描述' }).trim().min(1, '請填寫角色的外觀描述').max(500, '外觀描述最多 500 字').optional(),
  identityAnchors: z.string().trim().max(250, '身份錨點最多 250 字').optional(),
  look: z.string().trim().max(250, '造型最多 250 字').optional(),
  continuityLocks: z
    .array(z.string().trim().min(1).max(80, '每條連續性鎖最多 80 字'))
    .max(MAX_CONTINUITY_LOCKS, `連續性鎖最多 ${MAX_CONTINUITY_LOCKS} 條`)
    .default([]),
});
export type UpdateCharacterInput = z.input<typeof updateCharacterSchema>;

/** POST /api/series/:id/characters：系列角色庫新增角色（使用者 2026-11-05 提出） */
export const MAX_CHARACTER_NAME_LENGTH = 20;

export const createSeriesCharacterSchema = z.object({
  name: z
    .string({ error: '請填寫角色名稱' })
    .trim()
    .min(1, '請填寫角色名稱')
    .max(MAX_CHARACTER_NAME_LENGTH, `角色名稱最多 ${MAX_CHARACTER_NAME_LENGTH} 字`),
  description: updateCharacterSchema.shape.description,
  identityAnchors: updateCharacterSchema.shape.identityAnchors,
  look: updateCharacterSchema.shape.look,
  continuityLocks: updateCharacterSchema.shape.continuityLocks,
});
export type CreateSeriesCharacterInput = z.input<typeof createSeriesCharacterSchema>;

/** 重生哪一張：三視圖、定裝圖，或兩張一起（沒傳） */
export const CHARACTER_PARTS = ['sheet', 'look'] as const;
export type CharacterPart = (typeof CHARACTER_PARTS)[number];

export const generateCharacterSchema = z.object({
  consentToken: z.string().optional(),
  part: z.enum(CHARACTER_PARTS, { error: '只能重生三視圖或定裝圖' }).optional(),
});

/** 角色沒確認時，「生成」旁列出的原因 */
export function characterBlockers(characters: readonly Pick<Character, 'name' | 'state'>[]): string[] {
  return characters.filter((c) => c.state !== 'confirmed').map((c) => `角色「${c.name}」還沒確認定裝圖`);
}

/** 連續性鎖輸入框：一行一條，去掉空白與重複 */
export function parseLocks(text: string): string[] {
  return [...new Set(text.split('\n').map((line) => line.trim()).filter(Boolean))];
}

/** 角色在畫面上的標籤：狀態，系列角色另外標示「系列角色」 */
export function characterTags(character: Pick<Character, 'isSeries' | 'state'>): string[] {
  return [...(character.isSeries ? ['系列角色'] : []), CHARACTER_STATE_LABELS[character.state]];
}
