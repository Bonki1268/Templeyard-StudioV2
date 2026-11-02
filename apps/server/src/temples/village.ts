const CITY_PREFIX = '新北市';
// 行政區之後的 1～3 個字加「里」
const VILLAGE_AT_START = /^([一-鿿]{1,3}?里)/u;

/**
 * 里別：原始資料有值就用；缺漏時從地址補。
 * 只在確定是里別時才補：後面緊接「數字＋鄰」，或是同一行政區已知的里。
 * knownVillages 的元素是「行政區＋里」，例如「三芝區茂長里」。
 */
export function resolveVillage(
  address: string,
  district: string,
  village: string,
  knownVillages: ReadonlySet<string>,
): string | null {
  if (village.trim()) return village.trim();

  let rest = address.trim();
  if (rest.startsWith(CITY_PREFIX)) rest = rest.slice(CITY_PREFIX.length);
  if (!rest.startsWith(district)) return null;
  rest = rest.slice(district.length);

  const candidate = VILLAGE_AT_START.exec(rest)?.[1];
  if (!candidate) return null;

  const followedByNeighborhood = /^\d+鄰/u.test(rest.slice(candidate.length));
  if (followedByNeighborhood || knownVillages.has(`${district}${candidate}`)) return candidate;
  return null;
}
