import type { Character } from './characters.js';

// 系列頁角色庫與角色詳情（03 系列頁、設計稿 Characters、CharacterDetail）

export const CHARACTER_SCOPES = ['all', 'series', 'video'] as const;
export type CharacterScope = (typeof CHARACTER_SCOPES)[number];
export const CHARACTER_SCOPE_LABELS: Record<CharacterScope, string> = { all: '全部', series: '系列角色', video: '影片專屬' };

/** 查詢參數：沒傳用 all；不在清單回傳 null */
export function parseCharacterScope(_value: string | undefined): CharacterScope | null {
  throw new Error('尚未實作：parseCharacterScope');
}

/** 角色庫的搜尋與篩選：名稱或外觀描述包含關鍵字（不分大小寫、忽略前後空白），再依範圍篩選 */
export function filterCharacters<T extends Pick<Character, 'name' | 'isSeries'> & { version: { description: string } }>(
  _characters: readonly T[],
  _options: { scope: CharacterScope; query: string },
): T[] {
  throw new Error('尚未實作：filterCharacters');
}

export function characterScopeCounts(_characters: readonly Pick<Character, 'isSeries'>[]): Record<CharacterScope, number> {
  throw new Error('尚未實作：characterScopeCounts');
}

/** 角色卡的狀態標籤：第 2 版以後還沒確認的，說明是「需重新確認」 */
export function libraryStatusLabel(_character: Pick<Character, 'state'> & { version: { version: number } }): string {
  throw new Error('尚未實作：libraryStatusLabel');
}

/** 外觀描述由身份錨點與造型組成（用「；」接起來，略過空的） */
export function composeDescription(_identityAnchors: string, _look: string): string {
  throw new Error('尚未實作：composeDescription');
}

type VersionText = { version: number; identityAnchors: string; look: string; continuityLocks: readonly string[] };

/** 和上一版的差別（版本說明）；沒有文字上的修改而是重生圖片時，說明重生了哪一張 */
export function describeChange(_previous: VersionText, _next: Omit<VersionText, 'version'>, _regenerated?: 'sheet' | 'look'): string {
  throw new Error('尚未實作：describeChange');
}

/** 舊資料沒有身份錨點與造型：整段外觀描述放在造型 */
export function splitDescription(_version: { description: string; identityAnchors: string | null; look: string | null }): { identityAnchors: string; look: string } {
  throw new Error('尚未實作：splitDescription');
}

/** 版本切換按鈕：目前的版本加註「目前」 */
export function versionButtonLabel(_version: number, _currentVersion: number): string {
  throw new Error('尚未實作：versionButtonLabel');
}
