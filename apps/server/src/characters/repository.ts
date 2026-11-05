import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { characterVersions, characters, frames, generations, plans, shots, videos, type CharacterRow, type CharacterVersionRow, type GenerationRow } from '../db/schema.js';

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

/** 角色的所有版本，舊的在前 */
export function listCharacterVersions(db: AppDatabase, characterId: string): CharacterVersionRow[] {
  return db.select().from(characterVersions).where(eq(characterVersions.characterId, characterId)).orderBy(asc(characterVersions.version)).all();
}

/** 系列頁角色庫：這個系列的系列角色，加上這個系列影片的影片專屬角色；依建立順序 */
export function listLibraryCharacters(db: AppDatabase, seriesId: string): CharacterRow[] {
  const videoIds = db.select({ id: videos.id }).from(videos).where(eq(videos.seriesId, seriesId)).all().map((row) => row.id);
  const ownedByVideo = videoIds.length > 0 ? inArray(characters.videoId, videoIds) : sql`0`;
  return db
    .select()
    .from(characters)
    .where(or(and(eq(characters.isSeries, true), eq(characters.seriesId, seriesId)), and(eq(characters.isSeries, false), ownedByVideo)))
    .orderBy(sql`rowid`)
    .all();
}

/**
 * 這個系列每個角色用在哪些影片：影片現行方案的格子出場的角色，加上影片專屬角色所屬的影片
 * （方案裡存的是角色編號；第 7 階段留下的名稱不算）
 */
export function characterUsageBySeries(db: AppDatabase, seriesId: string): Map<string, string[]> {
  const usage = new Map<string, Set<string>>();
  const add = (characterId: string, videoId: string) => usage.set(characterId, (usage.get(characterId) ?? new Set()).add(videoId));
  for (const { id: videoId } of db.select({ id: videos.id }).from(videos).where(eq(videos.seriesId, seriesId)).all()) {
    const plan = db.select({ id: plans.id }).from(plans).where(eq(plans.videoId, videoId)).orderBy(desc(plans.version)).get();
    if (plan) for (const shot of db.select({ ids: shots.characterIds }).from(shots).where(eq(shots.planId, plan.id)).all()) for (const id of shot.ids) add(id, videoId);
    for (const owned of db.select({ id: characters.id }).from(characters).where(eq(characters.videoId, videoId)).all()) add(owned.id, videoId);
  }
  return new Map([...usage].map(([characterId, videoIds]) => [characterId, [...videoIds]]));
}

/** 這支影片最近一張精緻圖或關鍵畫格生成時依據的角色版本號碼（numberOf：版本編號 → 版本號碼）；沒有就回傳 null */
export function latestFrameVersionFor(db: AppDatabase, videoId: string, numberOf: ReadonlyMap<string, number>): number | null {
  const rows = db.select({ basedOn: frames.basedOn }).from(frames).where(eq(frames.videoId, videoId)).orderBy(desc(frames.createdAt), desc(sql`rowid`)).all();
  for (const row of rows) {
    const ids = row.basedOn.characterVersionIds;
    if (!Array.isArray(ids)) continue;
    for (const id of ids) {
      const found = typeof id === 'string' ? numberOf.get(id) : undefined;
      if (found !== undefined) return found;
    }
  }
  return null;
}
