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

/** 解析 CSV 文字（可含 BOM、引號、CRLF），每列以 schema 驗證 */
export function parseTemplesCsv(_text: string): RawTempleRow[] {
  throw new Error('尚未實作');
}
