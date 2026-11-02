// 呼叫綁定（哪個資料寫進 MCP 呼叫的哪個參數）的儲存檢查，與連續性鎖的列表。
// 規則和 packages/prompts/src/bindings.ts、locks.ts 相同（有測試確認兩邊一致）。

const fs = require('node:fs');
const path = require('node:path');

const SLOT_NAMES = ['prompt', 'aspectRatio', 'durationSec', 'seed'];
const SPECIAL_SOURCES = ['output.prompt', 'target.aspectRatio'];
const DEFAULT_WORKFLOWS_FILE = path.join(__dirname, '..', '..', 'workflows', 'models.json');

// 讀取 workflows/models.json；WORKFLOWS_FILE 可以指定別的位置
function loadWorkflows() {
  return JSON.parse(fs.readFileSync(process.env.WORKFLOWS_FILE || DEFAULT_WORKFLOWS_FILE, 'utf8'));
}

// 這個節點會用到的工作流程：指定了模型就只看那一個；空白就看同類型、呼叫方式已知的所有模型
function workflowsFor(prompt, workflows) {
  const entries = Object.entries(workflows.models || {});
  const model = prompt.target && prompt.target.model;
  if (model) return entries.filter(([key]) => key === model);
  return entries.filter(([, m]) => m.kind === (prompt.target && prompt.target.kind) && m.status !== 'unknown');
}

// 回傳錯誤訊息陣列；空陣列代表通過
function validateBindings(prompt, workflows) {
  const bindings = prompt.bindings || {};
  const slots = Object.keys(bindings);
  if (!prompt.target || prompt.target.kind === 'text') return slots.length ? ['文字節點直接送 Claude，不能有呼叫綁定'] : [];

  const errors = [];
  if (!bindings.prompt) errors.push('圖片與影片節點要有呼叫綁定 prompt');
  const declared = new Set((prompt.variables || []).map(v => v.name));
  const models = workflowsFor(prompt, workflows);
  for (const slot of slots) {
    const source = bindings[slot] || '';
    if (!SLOT_NAMES.includes(slot)) {
      errors.push(`呼叫綁定 ${slot} 不是工作流程的位置`);
      continue;
    }
    if (!SPECIAL_SOURCES.includes(source) && !declared.has(source)) {
      errors.push(`呼叫綁定 ${slot} 用到 ${source}，但變數清單沒有宣告`);
    }
    for (const [, model] of models) {
      if (!model.slots || !model.slots[slot]) errors.push(`呼叫綁定 ${slot}：${model.label} 的工作流程沒有這個位置`);
    }
  }
  return errors;
}

function lookup(vars, name) {
  return name.split('.').reduce((obj, key) => (obj == null ? undefined : obj[key]), vars);
}

// 變數名稱以 locks 結尾的是連續性鎖，例如 temple.appearanceLocks、character.locks
function isLockVariable(name) {
  const last = name.split('.').pop() || '';
  return /locks$/i.test(last) && (last.length === 5 || /[a-z]Locks$/.test(last));
}

function splitLocks(value) {
  const parts = Array.isArray(value) ? value.map(String) : typeof value === 'string' ? value.split(/[;；\n]/) : [];
  return parts.map(p => p.trim()).filter(Boolean);
}

// 從組裝用的變數裡找出連續性鎖，拆成一條一條（不重複）
function listLocks(prompt, variables) {
  const locks = [];
  for (const v of prompt.variables || []) {
    if (!isLockVariable(v.name)) continue;
    for (const lock of splitLocks(lookup(variables, v.name))) if (!locks.includes(lock)) locks.push(lock);
  }
  return locks;
}

module.exports = { loadWorkflows, validateBindings, listLocks, SLOT_NAMES };
