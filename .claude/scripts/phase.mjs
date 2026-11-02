// 切換開發階段：node .claude/scripts/phase.mjs red|green|idle
// red：可以寫情境與測試；green：測試鎖定；idle：階段之間。
// 切到 red 或 idle 前，工作區必須乾淨（所有變更都已 commit）。
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PHASES = ['red', 'green', 'idle'];
const next = process.argv[2];
if (!PHASES.includes(next)) {
  console.error('用法：node .claude/scripts/phase.mjs red|green|idle');
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const stateDir = path.join(root, '.claude', 'state');
const phaseFile = path.join(stateDir, 'phase');
const current = existsSync(phaseFile) ? readFileSync(phaseFile, 'utf8').trim() : 'idle';

if (next !== 'green') {
  let dirty = '';
  try {
    dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root }).toString().trim();
  } catch {
    // 還沒 git init（第 0 階段最開始），不檢查。
  }
  if (dirty) {
    console.error(`工作區還有未 commit 的變更，先 commit 再切換到 ${next}：\n${dirty}`);
    process.exit(1);
  }
}

mkdirSync(stateDir, { recursive: true });
writeFileSync(phaseFile, `${next}\n`);
console.log(`階段：${current} → ${next}`);
