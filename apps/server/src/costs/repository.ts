import { settingsSchema, type Settings } from '@templeyard/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { generations, settings } from '../db/schema.js';

/** 還在預留費用的狀態：送出前、送出後、逾時（任務可能仍在雲端執行、可能扣點） */
const RESERVING = ['awaiting_confirm', 'submitted', 'running', 'timeout'] as const;

/** 這支影片已用（成功的實際費用）與預留（還沒結束的生成） */
export function videoSpending(db: AppDatabase, videoId: string): { spent: number; reserved: number } {
  const spent = db
    .select({ total: sql<number>`coalesce(sum(${generations.actualCost}), 0)` })
    .from(generations)
    .where(and(eq(generations.videoId, videoId), eq(generations.status, 'succeeded')))
    .get();
  const reserved = db
    .select({ total: sql<number>`coalesce(sum(${generations.reservedCost}), 0)` })
    .from(generations)
    .where(and(eq(generations.videoId, videoId), inArray(generations.status, [...RESERVING])))
    .get();
  return { spent: Number(spent?.total ?? 0), reserved: Number(reserved?.total ?? 0) };
}

const DEFAULT_SETTINGS: Settings = { consentThresholdCredits: null };

export function getSettings(db: AppDatabase): Settings {
  const rows = db.select().from(settings).all();
  const values: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const row of rows) if (row.key in DEFAULT_SETTINGS) values[row.key] = row.value;
  return settingsSchema.parse(values);
}

export function updateSettings(db: AppDatabase, input: Partial<Settings>): Settings {
  for (const [key, value] of Object.entries(input)) {
    db.insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } })
      .run();
  }
  return getSettings(db);
}
