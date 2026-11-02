import type { AppDatabase } from '../db/client.js';
import type { TempleRow } from '../db/schema.js';

export function listTemples(_db: AppDatabase, _options: { includeInactive: boolean }): TempleRow[] {
  throw new Error('尚未實作');
}

export function countTemples(_db: AppDatabase): number {
  throw new Error('尚未實作');
}
