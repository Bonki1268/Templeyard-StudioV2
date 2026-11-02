import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cleanTemples } from './clean.js';
import { parseTemplesCsv } from './csv.js';

const sample = readFileSync(new URL('./__fixtures__/temples-sample.csv', import.meta.url), 'utf8');
const cleaned = cleanTemples(parseTemplesCsv(sample));
const byId = (suffix: string) => {
  const row = cleaned.find((r) => r.id.endsWith(suffix));
  if (!row) throw new Error(`fixture 裡找不到 ${suffix}`);
  return row;
};

describe('寺廟資料清理', () => {
  it('每一列都保留原始 UUID 與登記名稱原文', () => {
    expect(cleaned).toHaveLength(10);
    expect(byId('0001')).toMatchObject({ id: 'A0000000-0000-0000-0000-000000000001', name: '臺北鎮北宮' });
  });

  it('搜尋用名稱轉「台」並去掉前綴', () => {
    expect(byId('0001').nameNormalized).toBe('台北鎮北宮');
    expect(byId('0003').nameNormalized).toBe('泰山巖');
  });

  it('已廢止、未登記、財團法人的標記與狀態', () => {
    expect(byId('0005')).toMatchObject({ status: 'abolished', flags: ['abolished'] });
    expect(byId('0006')).toMatchObject({ status: 'unregistered', flags: ['unregistered'] });
    expect(byId('0003')).toMatchObject({ status: 'active', flags: ['foundation'] });
  });

  it('搜尋用名稱相同的寺廟都標記為重名', () => {
    expect(byId('0007').flags).toContain('duplicate_name');
    expect(byId('0008').flags).toContain('duplicate_name');
    expect(byId('0009').flags).not.toContain('duplicate_name');
  });

  it('創建年與重建年換算成西元並保留原始紀年', () => {
    expect(byId('0002')).toMatchObject({
      foundedYear: 1882,
      foundedRaw: '光緒8',
      rebuiltYear: 1987,
      rebuiltRaw: '民國76年',
    });
    expect(byId('0005')).toMatchObject({ foundedYear: 1562, foundedRaw: '民前350' });
    expect(byId('0010')).toMatchObject({ rebuiltYear: null, rebuiltRaw: '58' });
  });

  it('電話正規化並保留原始值', () => {
    expect(byId('0003')).toMatchObject({ phone: '0229000003', phoneRaw: '02 2900 0003' });
    expect(byId('0006')).toMatchObject({ phone: null, phoneRaw: '無電話' });
  });

  it('里別缺漏時從地址補，補不到留空', () => {
    expect(byId('0007').village).toBe('龍潭里');
    expect(byId('0009').village).toBeNull();
    expect(byId('0001').village).toBe('文化里');
  });

  it('主祀神明與教別保留原文', () => {
    expect(byId('0010')).toMatchObject({ deity: '天上聖母', religion: '道教' });
  });
});
