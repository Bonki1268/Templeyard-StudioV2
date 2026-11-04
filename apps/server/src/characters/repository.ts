import { and, desc, eq, or, sql } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { characterVersions, characters, generations, type CharacterRow, type CharacterVersionRow, type GenerationRow } from '../db/schema.js';

// 角色與版本的資料存取（05 characters、character_versions）

export function findCharacter(db: AppDatabase, id: string): CharacterRow | null {
  return db.select().from(characters).where(eq(characters.id, id)).get() ?? null;
}

export function findCharacterName(db: AppDatabase, id: string): string | null {
  return findCharacter(db, id)?.name ?? null;
}

/** 這支影片能用的角色：影片專屬角色，加上同系列的系列角色；依建立順序 */
export function listCharactersFor(db: AppDatabase, video: { id: string; seriesId: string }): CharacterRow[] {
  return db
    .select()
    .from(characters)
    .where(or(eq(characters.videoId, video.id), and(eq(characters.isSeries, true), eq(characters.seriesId, video.seriesId))))
    .orderBy(sql`rowid`)
    .all();
}

/** 系列角色庫：這個系列的系列角色（含從影片設為系列角色的）；依建立順序 */
export function listSeriesCharacters(db: AppDatabase, seriesId: string): CharacterRow[] {
  return db
    .select()
    .from(characters)
    .where(and(eq(characters.isSeries, true), eq(characters.seriesId, seriesId)))
    .orderBy(sql`rowid`)
    .all();
}

export function insertCharacter(db: AppDatabase, row: CharacterRow): void {
  db.insert(characters).values(row).run();
}

export function updateCharacter(db: AppDatabase, id: string, patch: Partial<Omit<CharacterRow, 'id'>>): void {
  db.update(characters).set(patch).where(eq(characters.id, id)).run();
}

export function findCharacterVersion(db: AppDatabase, id: string): CharacterVersionRow | null {
  return db.select().from(characterVersions).where(eq(characterVersions.id, id)).get() ?? null;
}

export function insertCharacterVersion(db: AppDatabase, row: CharacterVersionRow): void {
  db.insert(characterVersions).values(row).run();
}

export function updateCharacterVersion(db: AppDatabase, id: string, patch: Partial<Omit<CharacterVersionRow, 'id' | 'characterId'>>): void {
  db.update(characterVersions).set(patch).where(eq(characterVersions.id, id)).run();
}

/** 這個版本某一部分（三視圖或定裝圖）最近一次的生成紀錄 */
export function latestCharacterGeneration(db: AppDatabase, node: string, versionId: string): GenerationRow | null {
  return (
    db
      .select()
      .from(generations)
      .where(and(eq(generations.node, node), sql`json_extract(${generations.target}, '$.characterVersionId') = ${versionId}`))
      .orderBy(desc(generations.createdAt), desc(sql`rowid`))
      .get() ?? null
  );
}
