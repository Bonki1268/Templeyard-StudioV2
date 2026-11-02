import type { CreateSeriesInput, Series, UpdateSeriesInput } from '@templeyard/shared';
import { desc, eq } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { series, type SeriesRow } from '../db/schema.js';

/** 新資料需要的時間與 ID；測試可注入固定值 */
export type Clock = { now: () => Date; newId: () => string };

function toSeries(row: SeriesRow): Series {
  return {
    id: row.id,
    name: row.name,
    visualStyle: row.visualStyle,
    durationSec: row.durationSec,
    direction: row.direction,
    defaultImageModel: row.defaultImageModel,
    defaultVideoModel: row.defaultVideoModel,
    questionnaireDefaults: row.questionnaireDefaults ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** 系列列表：新建立的在前面 */
export function listSeries(db: AppDatabase): Series[] {
  return db.select().from(series).orderBy(desc(series.createdAt), desc(series.id)).all().map(toSeries);
}

export function createSeries(db: AppDatabase, input: CreateSeriesInput, clock: Clock): Series {
  const now = clock.now().toISOString();
  const row = db
    .insert(series)
    .values({ id: clock.newId(), ...input, questionnaireDefaults: null, createdAt: now, updatedAt: now })
    .returning()
    .get();
  return toSeries(row);
}

/** 找不到時回傳 null */
export function updateSeries(db: AppDatabase, id: string, input: UpdateSeriesInput, clock: Clock): Series | null {
  const row = db
    .update(series)
    .set({ ...input, updatedAt: clock.now().toISOString() })
    .where(eq(series.id, id))
    .returning()
    .get();
  return row ? toSeries(row) : null;
}
