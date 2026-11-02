import type { TempleFlag } from '@templeyard/shared';
import type { TempleRow } from '../db/schema.js';
import type { RawTempleRow } from './csv.js';
import { parseEraYear } from './era.js';
import { normalizeTempleName, parseNameFlags, statusFromFlags } from './name.js';
import { normalizePhone } from './phone.js';
import { resolveVillage } from './village.js';

/** 依 05 的清理規則，把原始資料轉成 temples 資料表的列；祭典日期全部空白，不保留 */
export function cleanTemples(rows: readonly RawTempleRow[]): TempleRow[] {
  // 已知的里：原始資料有填里別的「行政區＋里」
  const knownVillages = new Set(
    rows.filter((row) => row.tep_village.trim()).map((row) => `${row.tep_area.trim()}${row.tep_village.trim()}`),
  );

  // 重名：搜尋用名稱出現不只一次
  const nameCounts = new Map<string, number>();
  for (const row of rows) {
    const key = normalizeTempleName(row.tep_name);
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }

  return rows.map((row): TempleRow => {
    const nameNormalized = normalizeTempleName(row.tep_name);
    const flags: TempleFlag[] = parseNameFlags(row.tep_name);
    if ((nameCounts.get(nameNormalized) ?? 0) > 1) flags.push('duplicate_name');
    const district = row.tep_area.trim();

    return {
      id: row.tep_id.trim(),
      name: row.tep_name,
      nameNormalized,
      flags,
      status: statusFromFlags(flags),
      district,
      village: resolveVillage(row.tep_address, district, row.tep_village, knownVillages),
      address: row.tep_address.trim(),
      phone: normalizePhone(row.tep_phone),
      phoneRaw: row.tep_phone,
      deity: row.tep_god.trim(),
      religion: row.tep_class.trim(),
      foundedYear: parseEraYear(row.tep_buildtime),
      foundedRaw: row.tep_buildtime,
      rebuiltYear: parseEraYear(row.tep_rebuildtime),
      rebuiltRaw: row.tep_rebuildtime,
    };
  });
}
