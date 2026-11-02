# Prompt Studio

廟埕影室（Templeyard Studio）每個生成節點都有自己的 AI 指令（prompt），每個指令是 `prompts/` 裡的一個 JSON 檔。
這個工具提供編輯頁與 API：在頁面上修改、儲存，就會直接更新對應的 JSON 檔；系統生成時呼叫 API，由 API 依 JSON 檔與輸入資料組出送給 AI 的內容。

所有指令依規格書 v8 與 drama-skills（MIT 授權，見 `docs/drama-skills/`）的寫法撰寫；每個 prompt 的 `basis` 欄位列出它依據的 drama-skills 檔案。

## 啟動

需要 Node.js 18 以上，不需安裝套件。

```bash
node server.js          # 開啟 http://localhost:3300
PORT=4000 node server.js
npm test                # 執行 API 測試（使用暫存複本，不會改到 prompts/）
```

## 節點與檔案

| 步驟 | 檔案 | 用途 | 類型 |
| --- | --- | --- | --- |
| 1 | `character-design.json` | 角色外觀描述與連續性鎖（AI 幫我寫；第 5 步新角色也用） | 文字 |
| 2 | `temple-view.json` | 寺廟定裝版的一個視角圖；補充視角也用這個節點 | 圖片 |
| 4 | `copy-polish.json` | 問卷「想講的故事」（AI 幫我寫） | 文字 |
| 5 | `story-script.json` | 分鏡方案（輸出 JSON）；方案修改沿用同一套寫法 | 文字 |
| 5 | `storyboard-image.json` | 構圖草圖（選用，Nano Banana 2 Lite） | 圖片 |
| 5 | `character-sheet.json` | 角色三視圖 | 圖片 |
| 5 | `character-look.json` | 角色定裝圖 | 圖片 |
| 5 | `keyframe.json` | 中間關鍵畫格（5b） | 圖片 |
| 6 | `refined-frame.json` | 精緻圖（首格／末格） | 圖片 |
| 6 | `region-edit.json` | 分鏡細修的限定範圍修改 | 圖片 |
| 6 | `shot-video.json` | 分鏡影片 | 影片 |

創作 Agent、設定問卷與通用的 AI 輔助撰寫，以 Claude 的工具定義實作（`packages/agent`），不在這裡。

## 圖片與影片節點：兩段式

drama-skills 要求送給模型的最終指令是一段自然的工作說明，而且每個模型有自己的寫法（例如 Seedance 的 `{角色用中文說：「…」}`、Wan 的時間段）。把資料機械式套進範本做不到這些，所以圖片與影片節點分兩段：

1. **撰寫**：`render` 組出的 `request` 先送給 Claude。`system` 是撰寫規則（drama-skills 的做法＋這支影片所選模型的寫法），`messages` 是這一格的資料。Claude 回傳 JSON：`prompt`（最終指令）與 `notes`（給使用者看的說明）。
2. **生成**：把 `prompt` 連同參考圖、秒數與比例送到 Comfy Cloud MCP。

- 分鏡細修的「進階：生成指令」顯示與改寫的是第 1 段產生的 `prompt`；改寫後只屬於那一格。
- 生成前由程式檢查：角色與寺廟的連續性鎖片語是否逐字出現在 `prompt` 中（不分大小寫、不能出現在「no／不要」之後）；缺少時要求 Claude 重寫一次，仍缺少就回報錯誤。
- 文字節點（`target.kind` 為 `text`）只有一段，直接送給 Claude。

## Prompt 檔格式

```json
{
  "id": "shot-video",
  "step": 6,
  "name": "分鏡影片",
  "description": "說明",
  "version": 4,
  "updatedAt": "2026-11-02T00:00:00.000Z",
  "target": { "kind": "video", "model": "", "aspectRatio": "16:9" },
  "system": "AI 的角色與規則，可用 {{變數}}",
  "template": "指令內容，用 {{shot.description}} 這樣的標記插入資料",
  "variables": [
    { "name": "shot.description", "label": "畫面內容與構圖", "required": true, "example": "廟埕中景…" }
  ],
  "output": { "format": "json", "schema": { "type": "object" } },
  "modelRules": { "gemini-omni-1.1-flash": "這個模型的寫法", "seedance-2.0": "…", "wan-2.2": "…" },
  "basis": ["docs/drama-skills/04_第5b與6步_影片提示詞/motion-recipe.md"]
}
```

- `step`：對應規格書 v8 的步驟（1 建立系列、2 建立影片與寺廟定裝版、3 創作對話、4 設定問卷、5 分鏡方案與定裝、6 生成與細修、7 成品）。
- `target.kind`：`text`、`image` 或 `video`；`model` 空白代表用這支影片選定的模型。
- `modelRules`：鍵是 `packages/shared` 的模型代號（`nano-banana-pro`、`nano-banana-2-lite`、`gemini-omni-1.1-flash`、`seedance-2.0`、`wan-2.2`）。`render` 帶入 `model` 時，該模型的寫法附加在 `system` 之後。
- `basis`：這份指令依據的 drama-skills 檔案，只供追溯，不參與組裝。
- 變數名稱可用點號表示巢狀資料，例如 `temple.name` 對應 `{ "temple": { "name": "…" } }`。物件或陣列會轉成 JSON 文字插入。
- 指令或模型寫法裡用到但未宣告的變數，儲存時會被拒絕；必填變數缺少時，組裝會被拒絕。
- `version` 與 `updatedAt` 由伺服器在儲存時自動更新，舊版本保存在 `prompts/.history/<id>/v<版本>.json`。

## API

| 方法 | 路徑 | 用途 |
| --- | --- | --- |
| GET | `/api/prompts` | 列出所有 prompt |
| GET | `/api/prompts/:id` | 讀取一個 prompt |
| PUT | `/api/prompts/:id` | 儲存，body：`{ prompt, expectedVersion }`；版本不符回 409，驗證失敗回 422 |
| GET | `/api/prompts/:id/history` | 歷史版本清單 |
| GET | `/api/prompts/:id/history/:version` | 讀取某個歷史版本 |
| POST | `/api/prompts/:id/render` | 組裝送給 AI 的內容，body：`{ variables, model }` |

`render` 的回應：

```json
{
  "request": {
    "promptId": "shot-video", "promptVersion": 4, "step": 6,
    "target": { "kind": "video", "model": "seedance-2.0", "aspectRatio": "16:9" },
    "system": "…已帶入變數的撰寫規則＋模型寫法…",
    "messages": [{ "role": "user", "content": "…已帶入變數的這一格資料…" }],
    "output": { "format": "json", "schema": {} }
  },
  "missing": [],
  "compiled": "export function build(input) { … }"
}
```

`promptId` 與 `promptVersion` 應寫進生成紀錄，方便追溯每次生成用的是哪一版指令。
`compiled` 是同一個 prompt 轉成的 JavaScript 函式原始碼，只供檢視插入點，伺服器不會執行它。

## 尚未包含

- 實際呼叫 AI 模型（`render` 只負責組出內容）。
- 呼叫綁定（哪個資料寫進 MCP 呼叫的哪個參數）與管理頁編輯 `modelRules` 的介面：開發計畫第 4 階段加入。
- 登入與權限：目前任何能開啟頁面的人都能修改指令，只應在本機或內部網路使用。
