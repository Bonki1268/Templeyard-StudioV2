import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../db/client.js';
import { temples } from '../db/schema.js';
import { templesCsvPath } from '../paths.js';
import { importTemples } from './import.js';

// 用真正的 data/temples.csv 驗證匯入結果
const csvText = readFileSync(templesCsvPath, 'utf8');

describe('匯入 data/temples.csv', () => {
  it('匯入後共 982 筆，有效寺廟 940 間', () => {
    const db = openDatabase(':memory:');

    const result = importTemples(db, csvText);

    expect(result).toEqual({ total: 982, active: 940 });
    expect(db.select().from(temples).all()).toHaveLength(982);
    expect(db.select().from(temples).where(eq(temples.status, 'active')).all()).toHaveLength(940);
  });

  it('排除的是 41 間已廢止與 1 間未登記', () => {
    const db = openDatabase(':memory:');
    importTemples(db, csvText);

    expect(db.select().from(temples).where(eq(temples.status, 'abolished')).all()).toHaveLength(41);
    expect(db.select().from(temples).where(eq(temples.status, 'unregistered')).all()).toHaveLength(1);
  });

  it('萬壽宮、慈德廟的創建年依民前紀年換算為 1562、1558，並保留原始紀年', () => {
    const db = openDatabase(':memory:');
    importTemples(db, csvText);

    const wanshou = db.select().from(temples).where(eq(temples.name, '萬壽宮(已廢止)')).get();
    const cide = db.select().from(temples).where(eq(temples.name, '慈德廟')).get();
    expect(wanshou).toMatchObject({ foundedYear: 1562, foundedRaw: '民前350' });
    expect(cide).toMatchObject({ foundedYear: 1558, foundedRaw: '民前354' });
  });

  it('重複匯入會整批取代，不會重複', () => {
    const db = openDatabase(':memory:');
    importTemples(db, csvText);

    const again = importTemples(db, csvText);

    expect(again).toEqual({ total: 982, active: 940 });
    expect(db.select().from(temples).all()).toHaveLength(982);
  });
});
