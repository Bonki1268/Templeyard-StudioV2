// 呼叫綁定（哪個資料寫進 MCP 呼叫的哪個參數）的儲存檢查，與連續性鎖的列表。
// 規則和 packages/prompts/src/bindings.ts、locks.ts 相同（有測試確認兩邊一致）。

// 讀取 workflows/models.json；WORKFLOWS_FILE 可以指定別的位置
function loadWorkflows() {
  throw new Error('尚未實作');
}

// 回傳錯誤訊息陣列；空陣列代表通過
function validateBindings(_prompt, _workflows) {
  throw new Error('尚未實作');
}

// 從組裝用的變數裡找出連續性鎖（變數名稱以 locks 結尾），拆成一條一條
function listLocks(_prompt, _variables) {
  throw new Error('尚未實作');
}

module.exports = { loadWorkflows, validateBindings, listLocks };
