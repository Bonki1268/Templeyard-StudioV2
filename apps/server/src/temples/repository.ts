import { count, eq } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { temples, type TempleRow } from '../db/schema.js';

export function listTemples(db: AppDatabase, options: { includeInactive: boolean }): TempleRow[] {
  const query = db.select().from(temples);
  return options.includeInactive ? query.all() : query.where(eq(temples.status, 'active')).all();
}

export function countTemples(db: AppDatabase): number {
  return db.select({ value: count() }).from(temples).get()?.value ?? 0;
}

/** 找不到時回傳 null */
export function findTemple(db: AppDatabase, id: string): TempleRow | null {
  return db.select().from(temples).where(eq(temples.id, id)).get() ?? null;
}
