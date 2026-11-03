import { asc, desc, eq, inArray } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { clips, finals, type ClipRow, type FinalRow } from '../db/schema.js';

// 分鏡影片與成品的資料存取（05 clips、finals）

export function listClips(db: AppDatabase, videoId: string): ClipRow[] {
  return db.select().from(clips).where(eq(clips.videoId, videoId)).orderBy(asc(clips.createdAt)).all();
}

export function insertClip(db: AppDatabase, row: ClipRow): void {
  db.insert(clips).values(row).run();
}

export function updateClip(db: AppDatabase, id: string, patch: Partial<Omit<ClipRow, 'id' | 'videoId'>>): void {
  db.update(clips).set(patch).where(eq(clips.id, id)).run();
}

export function findClip(db: AppDatabase, id: string): ClipRow | null {
  return db.select().from(clips).where(eq(clips.id, id)).get() ?? null;
}

export function deleteClips(db: AppDatabase, ids: readonly string[]): void {
  if (ids.length > 0) db.delete(clips).where(inArray(clips.id, [...ids])).run();
}

export function latestFinal(db: AppDatabase, videoId: string): FinalRow | null {
  return db.select().from(finals).where(eq(finals.videoId, videoId)).orderBy(desc(finals.createdAt), desc(finals.id)).get() ?? null;
}

export function insertFinal(db: AppDatabase, row: FinalRow): void {
  db.insert(finals).values(row).run();
}
