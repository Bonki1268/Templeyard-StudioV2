/**
 * 里別：原始資料有值就用；缺漏時從地址補。
 * knownVillages 的元素是「行政區＋里」，例如「三芝區茂長里」。
 */
export function resolveVillage(
  _address: string,
  _district: string,
  _village: string,
  _knownVillages: ReadonlySet<string>,
): string | null {
  throw new Error('尚未實作');
}
