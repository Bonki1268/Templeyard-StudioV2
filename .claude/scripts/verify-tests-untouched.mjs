// 確認從「測試提交」之後，情境、測試、fixtures、假服務都沒有被修改或新增。
// 用法：node .claude/scripts/verify-tests-untouched.mjs <測試提交的 hash>
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isProtectedTestPath } from './test-paths.mjs';

const base = process.argv[2] || '';
if (!/^[0-9a-f]{7,40}$/i.test(base)) {
  console.error('用法：node .claude/scripts/verify-tests-untouched.mjs <測試提交的 hash>');
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const git = (...args) =>
  execFileSync('git', args, { cwd: root }).toString().split('\n').map((s) => s.trim()).filter(Boolean);

const changed = new Set([
  ...git('diff', '--name-only', `${base}`, 'HEAD'),
  ...git('diff', '--name-only'),
  ...git('diff', '--name-only', '--cached'),
  ...git('ls-files', '--others', '--exclude-standard'),
]);

const touched = [...changed].filter(isProtectedTestPath).sort();
if (touched.length > 0) {
  console.error(`測試提交 ${base} 之後，下列測試相關檔案被修改或新增：`);
  for (const f of touched) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`通過：測試提交 ${base} 之後，情境與測試沒有被修改。`);
