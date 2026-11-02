// 綠燈之後不能修改的路徑：情境、測試、fixtures、假服務。
// protect-tests.mjs（hook）與 verify-tests-untouched.mjs 共用這份清單。

export const PROTECTED_TEST_PATTERNS = [
  /^features\//,
  /^tests\//,
  /(^|\/)__fixtures__\//,
  /(^|\/)fixtures\//,
  /\.(test|spec)\.[cm]?[jt]sx?$/,
];

/** @param {string} relPath repo 根目錄下的相對路徑，分隔符號為 / */
export function isProtectedTestPath(relPath) {
  return PROTECTED_TEST_PATTERNS.some((re) => re.test(relPath));
}
