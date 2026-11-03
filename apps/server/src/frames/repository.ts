import { eq, sql } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { frames, generations, type FrameRow, type GenerationRow } from '../db/schema.js';

// 精緻圖的資料存取（05 frames）

/** 這支影片的精緻圖，依建立順序 */
export function listFrames(db: AppDatabase, videoId: string): FrameRow[] {
  return db.select().from(frames).where(eq(frames.videoId, videoId)).orderBy(frames.createdAt, sql`rowid`).all();
}

export function findFrame(db: AppDatabase, id: string): FrameRow | null {
  return db.select().from(frames).where(eq(frames.id, id)).get() ?? null;
}

export function insertFrame(db: AppDatabase, row: FrameRow): void {
  db.insert(frames).values(row).run();
}

export function updateFrame(db: AppDatabase, id: string, patch: Partial<Omit<FrameRow, 'id' | 'videoId'>>): void {
  db.update(frames).set(patch).where(eq(frames.id, id)).run();
}

export function deleteFrames(db: AppDatabase, ids: readonly string[]): void {
  for (const id of ids) db.delete(frames).where(eq(frames.id, id)).run();
}

export function findGeneration(db: AppDatabase, id: string): GenerationRow | null {
  return db.select().from(generations).where(eq(generations.id, id)).get() ?? null;
}

/** 某一格某一種精緻圖最近的一張 */
export function latestFrame(rows: readonly FrameRow[], shotKey: string, kind: FrameRow['kind']): FrameRow | null {
  return [...rows].reverse().find((row) => row.shotKey === shotKey && row.kind === kind) ?? null;
}

