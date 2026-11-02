import { describe, expect, it } from 'vitest';
import { resolveVillage } from './village.js';

const known = new Set(['三芝區茂長里', '萬里區萬里里']);

describe('里別缺漏時從地址補', () => {
  it('原始資料有里別時直接使用', () => {
    expect(resolveVillage('新北市三芝區圓山里二坪頂69號', '三芝區', '圓山里', known)).toBe('圓山里');
  });

  it('地址在行政區後面是「某某里＋鄰」時補上里別', () => {
    expect(resolveVillage('新北市石門區德茂里6鄰下員坑36號之5', '石門區', '', known)).toBe('德茂里');
  });

  it('地址的里別是同一行政區已知的里時補上', () => {
    expect(resolveVillage('新北市三芝區茂長里陳厝坑51號之2', '三芝區', '', known)).toBe('茂長里');
  });

  it.each([
    ['新北市石門區內阿里磅1號', '石門區', '地名「內阿里磅」不是里'],
    ['新北市萬里區萬里加投293號', '萬里區', '行政區名稱裡的「里」不是里別'],
    ['新北市金山區金包里街70號', '金山區', '街名「金包里街」不是里'],
    ['新北市新莊區5鄰頭前路15巷1號', '新莊區', '地址沒有里'],
  ])('「%s」補不出里別，留空（%s）', (address, district) => {
    expect(resolveVillage(address, district, '', known)).toBeNull();
  });
});
