// PreToolUse hook：綠燈階段禁止修改情境、測試、fixtures、假服務，以及階段狀態檔。
// 其他階段不限制。exit code 2 = 擋下這次工具呼叫，stderr 的內容會回給 Claude。
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isProtectedTestPath } from '../scripts/test-paths.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.CLAUDE_PROJECT_DIR || path.resolve(here, '..', '..');

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  process.exit(0);
}

const phaseFile = path.join(root, '.claude', 'state', 'phase');
const phase = existsSync(phaseFile) ? readFileSync(phaseFile, 'utf8').trim() : 'idle';
if (phase !== 'green') process.exit(0);

const toolInput = input.tool_input || {};
const target = toolInput.file_path || toolInput.notebook_path || '';
if (!target) process.exit(0);

const rel = path.relative(root, path.resolve(root, target)).split(path.sep).join('/');

if (rel === '.claude/state/phase' || isProtectedTestPath(rel)) {
  process.stderr.write(
    `綠燈階段不能修改：${rel}\n` +
      '如果你認為測試或情境寫錯了，不要修改它：把原因寫進 docs/PROGRESS.md 的「等你處理」，' +
      '階段狀態改為「停止」，然後結束這個階段。\n',
  );
  process.exit(2);
}
process.exit(0);
