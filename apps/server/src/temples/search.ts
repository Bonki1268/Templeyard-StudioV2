import type { TempleSearchQuery, TempleSummary } from '@templeyard/shared';
import type { TempleRow } from '../db/schema.js';

/** 依關鍵字搜尋（廟名、行政區、主祀神明），預設排除已廢止與未登記 */
export function searchTemples(_rows: readonly TempleRow[], _query: TempleSearchQuery): TempleRow[] {
  throw new Error('尚未實作');
}

export function toTempleSummary(_row: TempleRow): TempleSummary {
  throw new Error('尚未實作');
}
