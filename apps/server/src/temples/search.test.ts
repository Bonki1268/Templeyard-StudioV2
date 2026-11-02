import { readFileSync } from 'node:fs';
import { templeSearchQuerySchema, templeSummarySchema } from '@templeyard/shared';
import { describe, expect, it } from 'vitest';
import { cleanTemples } from './clean.js';
import { parseTemplesCsv } from './csv.js';
import { searchTemples, toTempleSummary } from './search.js';

const sample = readFileSync(new URL('./__fixtures__/temples-sample.csv', import.meta.url), 'utf8');
const rows = cleanTemples(parseTemplesCsv(sample));

const search = (params: Record<string, string>) =>
  searchTemples(rows, templeSearchQuerySchema.parse(params));
const names = (params: Record<string, string>) => search(params).map((r) => r.name);

describe('寺廟搜尋：模糊比對', () => {
  it('用「台」搜尋登記為「臺」的廟名', () => {
    expect(names({ q: '台北鎮北宮' })).toContain('臺北鎮北宮');
  });

  it('用「臺」搜尋登記為「台」的廟名', () => {
    expect(names({ q: '臺北石靈宮' })).toContain('台北石靈宮');
  });

  it('不打財團法人前綴也找得到', () => {
    expect(names({ q: '泰山巖' })).toContain('財團法人新北市泰山巖');
  });

  it('打了財團法人前綴也找得到，而且同名的排第一', () => {
    const result = names({ q: '財團法人新北市泰山巖' });
    expect(result[0]).toBe('財團法人新北市泰山巖');
    expect(result).toContain('顯應祖師泰山巖');
  });
});

describe('寺廟搜尋：行政區與主祀神明', () => {
  it('以行政區搜尋只回傳該行政區', () => {
    const result = search({ q: '新莊區' });
    expect(result.map((r) => r.name).sort()).toEqual(['新莊慈祐宮', '新莊福成宮']);
  });

  it('以主祀神明搜尋', () => {
    expect(names({ q: '福德正神' }).sort()).toEqual(['新莊福成宮', '福龍宮', '福龍宮']);
  });

  it('多個關鍵字以空白分隔時，每個都要符合', () => {
    expect(names({ q: '新莊 福德正神' })).toEqual(['新莊福成宮']);
  });

  it('重名的寺廟都會回傳，以行政區區分', () => {
    const result = search({ q: '福龍宮' });
    expect(result.map((r) => r.district).sort()).toEqual(['汐止區', '瑞芳區']);
  });
});

describe('寺廟搜尋：排除規則', () => {
  it('預設排除已廢止', () => {
    expect(names({ q: '萬壽宮' })).toEqual([]);
  });

  it('預設排除未登記', () => {
    expect(names({ q: '全真仙觀' })).toEqual([]);
  });

  it('要求包含停用時，已廢止與未登記都會出現', () => {
    expect(names({ q: '萬壽宮', includeInactive: 'true' })).toEqual(['萬壽宮(已廢止)']);
    expect(names({ q: '全真仙觀', includeInactive: 'true' })).toEqual(['台灣全真仙觀(尚未取得正式寺廟登記證)']);
  });

  it('沒有關鍵字時回傳全部有效寺廟', () => {
    expect(search({})).toHaveLength(8);
  });
});

describe('寺廟搜尋：排序與筆數', () => {
  it('廟名開頭符合的排在只有主祀神明符合的前面', () => {
    // 「顯應祖師泰山巖」廟名開頭符合；「財團法人新北市泰山巖」只有主祀神明符合
    expect(names({ q: '顯應' })).toEqual(['顯應祖師泰山巖', '財團法人新北市泰山巖']);
  });

  it('筆數不超過 limit', () => {
    expect(search({ q: '福德正神', limit: '1' })).toHaveLength(1);
  });
});

describe('搜尋結果格式', () => {
  it('轉成 API 回應的格式並通過 schema 驗證', () => {
    const row = rows.find((r) => r.name === '新莊慈祐宮');
    if (!row) throw new Error('fixture 裡找不到新莊慈祐宮');

    const summary = toTempleSummary(row);

    expect(templeSummarySchema.parse(summary)).toEqual({
      id: 'A0000000-0000-0000-0000-000000000010',
      name: '新莊慈祐宮',
      status: 'active',
      flags: [],
      district: '新莊區',
      village: null,
      address: '新北市新莊區福德里中正路10號',
      deity: '天上聖母',
      religion: '道教',
      foundedYear: 1686,
    });
  });
});
