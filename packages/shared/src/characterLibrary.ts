import { z } from 'zod';
import { CHARACTER_STATE_LABELS, characterSchema, characterVersionSchema, type Character } from './characters.js';
import { VIDEO_STAGES } from './videos.js';

// 系列頁角色庫與角色詳情（03 系列頁、設計稿 Characters、CharacterDetail）

export const CHARACTER_SCOPES = ['all', 'series', 'video'] as const;
export type CharacterScope = (typeof CHARACTER_SCOPES)[number];
export const CHARACTER_SCOPE_LABELS: Record<CharacterScope, string> = { all: '全部', series: '系列角色', video: '影片專屬' };

/** 查詢參數：沒傳用 all；不在清單回傳 null */
export function parseCharacterScope(value: string | undefined): CharacterScope | null {
  if (value === undefined) return 'all';
  return (CHARACTER_SCOPES as readonly string[]).includes(value) ? (value as CharacterScope) : null;
}

/** 角色庫的搜尋與篩選：名稱或外觀描述包含關鍵字（不分大小寫、忽略前後空白），再依範圍篩選 */
export function filterCharacters<T extends Pick<Character, 'name' | 'isSeries'> & { version: { description: string } }>(
  characters: readonly T[],
  options: { scope: CharacterScope; query: string },
): T[] {
  const query = options.query.trim().toLowerCase();
  return characters.filter((character) => {
    if (options.scope === 'series' && !character.isSeries) return false;
    if (options.scope === 'video' && character.isSeries) return false;
    if (!query) return true;
    return character.name.toLowerCase().includes(query) || character.version.description.toLowerCase().includes(query);
  });
}

export function characterScopeCounts(characters: readonly Pick<Character, 'isSeries'>[]): Record<CharacterScope, number> {
  const series = characters.filter((character) => character.isSeries).length;
  return { all: characters.length, series, video: characters.length - series };
}

/** 角色卡的狀態標籤：第 2 版以後還沒確認的，說明是「需重新確認」 */
export function libraryStatusLabel(character: Pick<Character, 'state'> & { version: { version: number } }): string {
  const { state } = character;
  if (character.version.version > 1 && (state === 'draft' || state === 'pending_confirm')) return '需重新確認';
  if (state === 'pending_confirm') return '定裝圖待確認';
  return CHARACTER_STATE_LABELS[state];
}

/** 外觀描述由身份錨點與造型組成（用「；」接起來，略過空的） */
export function composeDescription(identityAnchors: string, look: string): string {
  return [identityAnchors, look]
    .map((part) => part.trim())
    .filter(Boolean)
    .join('；');
}

type VersionText = { version: number; identityAnchors: string; look: string; continuityLocks: readonly string[] };

/** 和上一版的差別（版本說明）；沒有文字上的修改而是重生圖片時，說明重生了哪一張 */
export function describeChange(previous: VersionText, next: Omit<VersionText, 'version'>, regenerated?: 'sheet' | 'look'): string {
  const changed = [
    // 舊資料沒有身份錨點（整段外觀描述放在造型）：第一次填身份錨點是拆分外觀，不算修改
    ...(previous.identityAnchors.trim() !== '' && previous.identityAnchors.trim() !== next.identityAnchors.trim() ? ['身份錨點'] : []),
    ...(previous.look.trim() !== next.look.trim() ? ['造型'] : []),
    ...(previous.continuityLocks.join('\n') !== next.continuityLocks.join('\n') ? ['連續性鎖'] : []),
  ];
  const head = `和 v${previous.version} 的差別：`;
  if (changed.length > 0) return `${head}${changed.join('、')}有修改`;
  if (regenerated) return `${head}重新產生${regenerated === 'sheet' ? '三視圖' : '定裝圖'}`;
  return `${head}沒有文字上的修改`;
}

/** 舊資料沒有身份錨點與造型：整段外觀描述放在造型 */
export function splitDescription(version: { description: string; identityAnchors: string | null; look: string | null }): { identityAnchors: string; look: string } {
  if (version.identityAnchors === null && version.look === null) return { identityAnchors: '', look: version.description };
  return { identityAnchors: version.identityAnchors ?? '', look: version.look ?? '' };
}

/** 版本切換按鈕：目前的版本加註「目前」 */
export function versionButtonLabel(version: number, currentVersion: number): string {
  return version === currentVersion ? `v${version} 目前` : `v${version}`;
}

/** GET /api/series/:id/characters：角色庫的角色，加上用在幾支影片 */
export const libraryCharacterSchema = characterSchema.extend({ videoCount: z.number().int().min(0).default(0) });
export type LibraryCharacter = z.infer<typeof libraryCharacterSchema>;
export const libraryCharactersResponseSchema = z.object({ characters: z.array(libraryCharacterSchema) });

/** GET /api/characters/:cid/versions */
export const characterVersionsResponseSchema = z.object({ versions: z.array(characterVersionSchema) });

/** GET /api/characters/:cid/usage：用到這個角色的影片與它依據的版本 */
export const characterUsageSchema = z.object({
  id: z.string(),
  seriesId: z.string(),
  title: z.string(),
  stage: z.enum(VIDEO_STAGES),
  version: z.number().int().positive(),
});
export type CharacterUsageItem = z.infer<typeof characterUsageSchema>;
export const characterUsageResponseSchema = z.object({ videos: z.array(characterUsageSchema) });
