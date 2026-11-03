import { and, desc, eq, isNull, max, sql } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import {
  confirmations,
  generations,
  templeBoards,
  templeBoardVersions,
  templeViews,
  type GenerationRow,
  type TempleBoardRow,
  type TempleBoardVersionRow,
  type TempleViewRow,
} from '../db/schema.js';

// 寺廟定裝版的資料存取（05「temple_boards、temple_board_versions、temple_views」、「confirmations」）

export function findBoard(db: AppDatabase, seriesId: string, templeId: string): TempleBoardRow | null {
  return db
    .select()
    .from(templeBoards)
    .where(and(eq(templeBoards.seriesId, seriesId), eq(templeBoards.templeId, templeId)))
    .get() ?? null;
}

export function findBoardById(db: AppDatabase, id: string): TempleBoardRow | null {
  return db.select().from(templeBoards).where(eq(templeBoards.id, id)).get() ?? null;
}

export function insertBoard(db: AppDatabase, row: TempleBoardRow): void {
  db.insert(templeBoards).values(row).run();
}

export function setCurrentVersion(db: AppDatabase, boardId: string, versionId: string): void {
  db.update(templeBoards).set({ currentVersionId: versionId }).where(eq(templeBoards.id, boardId)).run();
}

export function findVersion(db: AppDatabase, id: string): TempleBoardVersionRow | null {
  return db.select().from(templeBoardVersions).where(eq(templeBoardVersions.id, id)).get() ?? null;
}

/** 這份定裝版下一個版本號 */
export function nextVersionNumber(db: AppDatabase, boardId: string): number {
  const row = db
    .select({ latest: max(templeBoardVersions.version) })
    .from(templeBoardVersions)
    .where(eq(templeBoardVersions.boardId, boardId))
    .get();
  return (row?.latest ?? 0) + 1;
}

export function insertVersion(db: AppDatabase, row: TempleBoardVersionRow): void {
  db.insert(templeBoardVersions).values(row).run();
}

export function updateVersion(db: AppDatabase, id: string, patch: Partial<Omit<TempleBoardVersionRow, 'id' | 'boardId'>>): void {
  db.update(templeBoardVersions).set(patch).where(eq(templeBoardVersions.id, id)).run();
}

/** 某一版的視角，依建立順序（產生時已依標準清單排序） */
export function listViews(db: AppDatabase, versionId: string): TempleViewRow[] {
  return db.select().from(templeViews).where(eq(templeViews.boardVersionId, versionId)).orderBy(sql`rowid`).all();
}

export function findView(db: AppDatabase, id: string): TempleViewRow | null {
  return db.select().from(templeViews).where(eq(templeViews.id, id)).get() ?? null;
}

export function insertViews(db: AppDatabase, rows: TempleViewRow[]): void {
  if (rows.length > 0) db.insert(templeViews).values(rows).run();
}

export function updateView(db: AppDatabase, id: string, patch: Partial<Omit<TempleViewRow, 'id' | 'boardVersionId'>>): void {
  db.update(templeViews).set(patch).where(eq(templeViews.id, id)).run();
}

/** 這個視角最近一次的生成紀錄（temple-view 節點，target.viewId） */
export function latestViewGeneration(db: AppDatabase, node: string, viewId: string): GenerationRow | null {
  return (
    db
      .select()
      .from(generations)
      .where(and(eq(generations.node, node), sql`json_extract(${generations.target}, '$.viewId') = ${viewId}`))
      .orderBy(desc(generations.createdAt), desc(sql`rowid`))
      .get() ?? null
  );
}

/** 這支影片對這個版本還沒失效的確認紀錄 */
export function hasBoardConfirmation(db: AppDatabase, videoId: string, versionId: string): boolean {
  const row = db
    .select({ id: confirmations.id })
    .from(confirmations)
    .where(
      and(
        eq(confirmations.videoId, videoId),
        eq(confirmations.point, 'temple_board'),
        isNull(confirmations.invalidatedAt),
        sql`json_extract(${confirmations.contentRef}, '$.boardVersionId') = ${versionId}`,
      ),
    )
    .get();
  return row !== undefined;
}

export function insertConfirmation(db: AppDatabase, row: { id: string; videoId: string; versionId: string; confirmedAt: string }): void {
  db.insert(confirmations)
    .values({
      id: row.id,
      videoId: row.videoId,
      point: 'temple_board',
      contentRef: { boardVersionId: row.versionId },
      confirmedAt: row.confirmedAt,
      invalidatedAt: null,
    })
    .run();
}
