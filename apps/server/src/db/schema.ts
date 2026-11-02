import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { TempleFlag, TempleStatus } from '@templeyard/shared';

// 資料表依 docs/05-Backend-Schema.md

/** temples：由 data/temples.csv 匯入，執行期間只讀 */
export const temples = sqliteTable(
  'temples',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    nameNormalized: text('name_normalized').notNull(),
    flags: text('flags', { mode: 'json' }).$type<TempleFlag[]>().notNull(),
    status: text('status').$type<TempleStatus>().notNull(),
    district: text('district').notNull(),
    village: text('village'),
    address: text('address').notNull(),
    phone: text('phone'),
    phoneRaw: text('phone_raw').notNull(),
    deity: text('deity').notNull(),
    religion: text('religion').notNull(),
    foundedYear: integer('founded_year'),
    foundedRaw: text('founded_raw').notNull(),
    rebuiltYear: integer('rebuilt_year'),
    rebuiltRaw: text('rebuilt_raw').notNull(),
  },
  (table) => [
    index('temples_name_normalized_idx').on(table.nameNormalized),
    index('temples_district_idx').on(table.district),
    index('temples_deity_idx').on(table.deity),
  ],
);

export type TempleRow = typeof temples.$inferSelect;
export type NewTempleRow = typeof temples.$inferInsert;

/** series：系列專案 */
export const series = sqliteTable('series', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  visualStyle: text('visual_style').notNull(),
  durationSec: integer('duration_sec').notNull(),
  direction: text('direction').notNull(),
  defaultImageModel: text('default_image_model').notNull(),
  defaultVideoModel: text('default_video_model').notNull(),
  questionnaireDefaults: text('questionnaire_defaults', { mode: 'json' }).$type<Record<string, unknown> | null>(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type SeriesRow = typeof series.$inferSelect;
