import type { TempleSearchQuery, TempleSummary } from '@templeyard/shared';
import type { TempleRow } from '../db/schema.js';
import { normalizeTempleName } from './name.js';

// 排序分數：廟名完全相同 > 廟名開頭 > 廟名包含 > 只有行政區或主祀神明符合
const SCORE = { exact: 0, prefix: 1, contains: 2, otherField: 3 } as const;

/** 把查詢拆成關鍵字；每個關鍵字都用和廟名相同的方式正規化 */
function toTerms(q: string): string[] {
  return q
    .split(/\s+/u)
    .map((term) => normalizeTempleName(term))
    .filter((term) => term.length > 0);
}

function normalizeField(text: string): string {
  return text.normalize('NFKC').replace(/臺/gu, '台');
}

/** 回傳排序分數；任何一個關鍵字都不符合時回傳 null */
function scoreRow(row: TempleRow, terms: readonly string[], fullQuery: string): number | null {
  let nameMatchedAll = true;
  for (const term of terms) {
    const inName = row.nameNormalized.includes(term);
    const inOther = normalizeField(row.district).includes(term) || normalizeField(row.deity).includes(term);
    if (!inName && !inOther) return null;
    if (!inName) nameMatchedAll = false;
  }
  if (!nameMatchedAll) return SCORE.otherField;
  if (row.nameNormalized === fullQuery) return SCORE.exact;
  if (row.nameNormalized.startsWith(fullQuery)) return SCORE.prefix;
  return SCORE.contains;
}

/** 依關鍵字搜尋（廟名、行政區、主祀神明），預設排除已廢止與未登記 */
export function searchTemples(rows: readonly TempleRow[], query: TempleSearchQuery): TempleRow[] {
  const candidates = query.includeInactive ? rows : rows.filter((row) => row.status === 'active');
  const terms = toTerms(query.q);
  const fullQuery = normalizeTempleName(query.q);

  const scored: { row: TempleRow; score: number }[] = [];
  for (const row of candidates) {
    const score = terms.length === 0 ? SCORE.contains : scoreRow(row, terms, fullQuery);
    if (score !== null) scored.push({ row, score });
  }

  scored.sort(
    (a, b) =>
      a.score - b.score ||
      a.row.nameNormalized.localeCompare(b.row.nameNormalized, 'zh-Hant-TW') ||
      a.row.district.localeCompare(b.row.district, 'zh-Hant-TW'),
  );
  return scored.slice(0, query.limit).map((item) => item.row);
}

export function toTempleSummary(row: TempleRow): TempleSummary {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    flags: row.flags,
    district: row.district,
    village: row.village,
    address: row.address,
    deity: row.deity,
    religion: row.religion,
    foundedYear: row.foundedYear,
  };
}
