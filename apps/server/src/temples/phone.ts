// 新北市市話區碼
const NEW_TAIPEI_AREA_CODE = '02';

/**
 * 把登記電話正規化成含區碼的數字字串；無法判斷時回傳 null。
 * - 去掉開頭的 (h)、分機（轉…）與號碼後面的文字備註
 * - 8 碼市話補上 02；已有 0 開頭區碼或手機（9～10 碼）照用
 * - 其他長度（例如 7 碼）無法判斷區碼
 */
export function normalizePhone(raw: string): string | null {
  const withoutPrefix = raw.trim().replace(/^\(h\)/i, '');
  // 只取開頭由數字、括號、連字號、空白組成的部分
  const leading = /^[\d()\-\s]+/.exec(withoutPrefix)?.[0] ?? '';
  const digits = leading.replace(/\D/g, '');

  if (digits.startsWith('0')) {
    return digits.length === 9 || digits.length === 10 ? digits : null;
  }
  if (digits.length === 8) return `${NEW_TAIPEI_AREA_CODE}${digits}`;
  return null;
}
