import { parse } from 'csv-parse/sync';
import { z } from 'zod';

/** data/temples.csv 的一列（原始欄位） */
export const rawTempleRowSchema = z.object({
  tep_id: z.string().min(1),
  tep_name: z.string().min(1),
  tep_address: z.string(),
  tep_area: z.string().min(1),
  tep_village: z.string(),
  tep_phone: z.string(),
  tep_god: z.string(),
  tep_class: z.string(),
  tep_buildtime: z.string(),
  tep_rebuildtime: z.string(),
  tep_festivaldate: z.string(),
});
export type RawTempleRow = z.infer<typeof rawTempleRowSchema>;

const COLUMNS = Object.keys(rawTempleRowSchema.shape);

/** 解析 CSV 文字（可含 BOM、引號、CRLF），每列以 schema 驗證 */
export function parseTemplesCsv(text: string): RawTempleRow[] {
  const records: unknown = parse(text, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    relax_column_count: false,
  });
  if (!Array.isArray(records)) throw new Error('寺廟 CSV 格式不正確');

  return records.map((record: unknown, index) => {
    const columns = record && typeof record === 'object' ? Object.keys(record) : [];
    const missing = COLUMNS.filter((name) => !columns.includes(name));
    if (missing.length > 0) {
      throw new Error(`寺廟 CSV 缺少欄位：${missing.join('、')}`);
    }
    const result = rawTempleRowSchema.safeParse(record);
    if (!result.success) {
      // 第 1 列是欄位名稱，資料從第 2 列開始
      const fields = result.error.issues.map((issue) => issue.path.join('.')).join('、');
      throw new Error(`寺廟 CSV 第 ${index + 2} 列資料不正確：${fields}`);
    }
    return result.data;
  });
}
