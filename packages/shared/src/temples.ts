import { z } from 'zod';

// 寺廟資料（docs/05-Backend-Schema.md「temples」）

export const templeStatusSchema = z.enum(['active', 'abolished', 'unregistered']);
export type TempleStatus = z.infer<typeof templeStatusSchema>;

export const templeFlagSchema = z.enum(['foundation', 'abolished', 'unregistered', 'duplicate_name']);
export type TempleFlag = z.infer<typeof templeFlagSchema>;

/** GET /api/temples 的查詢參數 */
export const templeSearchQuerySchema = z.object({
  q: z.string().trim().max(100).default(''),
  includeInactive: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type TempleSearchQuery = z.infer<typeof templeSearchQuerySchema>;

/** 搜尋結果的一筆寺廟 */
export const templeSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  status: templeStatusSchema,
  flags: z.array(templeFlagSchema),
  district: z.string(),
  village: z.string().nullable(),
  address: z.string(),
  deity: z.string(),
  religion: z.string(),
  foundedYear: z.number().int().nullable(),
});
export type TempleSummary = z.infer<typeof templeSummarySchema>;

export const templeSearchResponseSchema = z.object({
  temples: z.array(templeSummarySchema),
});
export type TempleSearchResponse = z.infer<typeof templeSearchResponseSchema>;
