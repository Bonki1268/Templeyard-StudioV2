import { describe, expect, it } from 'vitest';
import { parseTemplesCsv } from './csv.js';

const header =
  'tep_id,tep_name,tep_address,tep_area,tep_village,tep_phone,tep_god,tep_class,tep_buildtime,tep_rebuildtime,tep_festivaldate';

describe('解析寺廟 CSV', () => {
  it('去掉 BOM、支援 CRLF 與引號內的空白', () => {
    const text = `\uFEFF${header}\r\nid-1,泰山巖,新北市泰山區明志路3號,泰山區,明志里,"02 2900 0003",顯應祖師,佛教,乾隆0,0,\r\n`;

    const rows = parseTemplesCsv(text);

    expect(rows).toEqual([
      {
        tep_id: 'id-1',
        tep_name: '泰山巖',
        tep_address: '新北市泰山區明志路3號',
        tep_area: '泰山區',
        tep_village: '明志里',
        tep_phone: '02 2900 0003',
        tep_god: '顯應祖師',
        tep_class: '佛教',
        tep_buildtime: '乾隆0',
        tep_rebuildtime: '0',
        tep_festivaldate: '',
      },
    ]);
  });

  it('引號內含逗號的地址不會被拆開', () => {
    const text = `${header}\nid-2,某宮,"新北市瑞芳區中山路270號, 266號旁",瑞芳區,,,福德正神,道教,0,0,\n`;

    expect(parseTemplesCsv(text)[0]?.tep_address).toBe('新北市瑞芳區中山路270號, 266號旁');
  });

  it('缺少必要欄位時丟出錯誤並指出第幾列', () => {
    const text = `${header}\n,沒有編號的廟,新北市板橋區,板橋區,,,,,0,0,\n`;

    expect(() => parseTemplesCsv(text)).toThrow(/第 2 列/);
  });

  it('欄位名稱不對時丟出錯誤', () => {
    expect(() => parseTemplesCsv('id,name\n1,某宮\n')).toThrow(/欄位/);
  });
});
