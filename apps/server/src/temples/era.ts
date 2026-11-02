/** 年號：元年的西元年與最多幾年（超過視為無法判斷） */
type Era = { firstYear: number; maxYears: number };

// 清代年號與日本年號（日據時期）
const ERAS: Readonly<Record<string, Era>> = {
  順治: { firstYear: 1644, maxYears: 18 },
  康熙: { firstYear: 1662, maxYears: 61 },
  雍正: { firstYear: 1723, maxYears: 13 },
  乾隆: { firstYear: 1736, maxYears: 60 },
  嘉慶: { firstYear: 1796, maxYears: 25 },
  道光: { firstYear: 1821, maxYears: 30 },
  咸豐: { firstYear: 1851, maxYears: 11 },
  同治: { firstYear: 1862, maxYears: 13 },
  光緒: { firstYear: 1875, maxYears: 34 },
  宣統: { firstYear: 1909, maxYears: 3 },
  明治: { firstYear: 1868, maxYears: 45 },
  大正: { firstYear: 1912, maxYears: 15 },
  昭和: { firstYear: 1926, maxYears: 64 },
};

const MINGUO_FIRST_YEAR = 1912;

// 「民前95」「民國58」「民國69年6月1日」「民64年11月」「康熙16」……
const PATTERN = /^(民前|民國|民|[一-鿿]{2})(\d+)(?:年(?:\d+月(?:\d+日)?)?)?$/u;

/**
 * 把寺廟資料的紀年（民國、民前、清代年號、日本年號）換算成西元年。
 * 無法判斷時回傳 null；原始值由呼叫端另外保留。
 * 「日據」「不詳」、年數為 0、只有數字沒有紀年，都視為無法判斷。
 */
export function parseEraYear(raw: string): number | null {
  const match = PATTERN.exec(raw.trim());
  if (!match) return null;
  const [, era = '', digits = ''] = match;
  const years = Number(digits);
  if (!Number.isInteger(years) || years <= 0) return null;

  if (era === '民前') return MINGUO_FIRST_YEAR - years;
  if (era === '民國' || era === '民') return MINGUO_FIRST_YEAR - 1 + years;

  const known = ERAS[era];
  if (!known || years > known.maxYears) return null;
  return known.firstYear - 1 + years;
}
