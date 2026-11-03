# 第 5 階段：寺廟定裝版

狀態：**完成**（中途因 4 個寫錯的單元測試停止一次，使用者同意後回到紅燈修正）

## 1. 對應的 F 與完成條件

| 項目 | 狀態 |
| --- | --- |
| F3 產生寺廟定裝版後模型鎖定，之後不能更換 | 完成：產生時寫入 `models_locked_at`；改模型或寺廟 API 回 409，畫面選項停用並說明 |
| F5 依視角清單產生空景視角圖、單張重生或修改、標示「依照片／AI 推測」、AI 推測必須確認、同系列同一間廟可沿用 | 完成 |
| 06：產生定裝版，依視角清單生成空景視角圖；模型在此鎖定 | 完成（每個視角一筆 `temple-view` 生成，整批一次同意） |
| 06：定裝版頁：單張重生、修改、AI 推測標示、確認 | 完成；「AI 幫我寫」依 06 的 `/api/assist` 排在第 6 階段，這階段按鈕停用並說明原因 |
| 06：沿用；另存新版本 | 完成 |
| 06：依 drama-skills 地點與視角、場景空鏡寫法撰寫 `temple-view` 指令 | 完成（`viewPrompt.ts` 組變數，Claude 寫最終指令，`claude/writer.ts`） |
| 完成條件：模型鎖定後 API 拒絕更改模型 | 完成（`routes/videos` 409、`reuse.feature`／`generate.feature`） |
| 完成條件：AI 推測的視角未確認時不能進入創作工作區 | 完成（確認 API 409 並列出未確認視角；頁面「確認定裝版」不能按） |
| 完成條件：沿用流程的端到端測試 | 完成（`reuse.feature` 5 個場景） |
| 第 4 階段稽核建議 3 項 | 完成（紅燈 813eaae）：`generations.model` 存供應商代號、comfy-client 補 5xx 與網路中斷測試、`results.test.ts` 改假網域 |
| 第 3 階段留下的「讓 AI 推測」「產生寺廟定裝版」按鈕 | 完成 |

## 2. 情境與測試

| 類別 | 檔案 | 數量 | 紅燈時 | 綠燈時 |
| --- | --- | --- | --- | --- |
| 情境 | `generate.feature` | 15 | 失敗 | 通過 |
| 情境 | `board-page.feature` | 10 | 失敗 | 通過 |
| 情境 | `reuse.feature` | 5 | 失敗 | 通過 |
| 情境 | 移除第 3 階段「產生寺廟定裝版還沒開放」1 個（功能已開放） | -1 | — | — |
| 單元／整合 | server `templeBoards/service`、`viewPrompt`、`routes/templeBoards`、`claude/writer`、`runtime/env`、`costs/consents`、`generations/service`（批次、預檢、供應商代號） | 約 90 | 全部失敗 | 全部通過 |
| 單元 | shared `templeBoards`、comfy-client 上傳與 5xx／網路中斷、prompts `references`、web `createVideoSteps` | 約 25 | 全部失敗 | 全部通過 |

- 紅燈（813eaae）：
  - 單元測試共 567 個，111 個失敗、456 個通過（通過的是既有測試）。
  - 情境共 147 個，30 個失敗，原因都是「尚未實作」（空函式丟出例外、路由回 404、頁面沒有元素）。
  - `routes/videos.test.ts` 的建立草稿預期多了 `templeBoardVersionId: null`，因為 schema 新增欄位。
- 綠燈（77ae929）：
  - `pnpm test` 567 個全部通過。
  - `pnpm test:e2e` 147 個全部通過（停止前連跑 2 次，修正後再跑 1 次）。
  - `pnpm typecheck`、`pnpm lint` 通過。
- 停止與修正的經過：
  - 第一次綠燈時，4 個單元測試不管怎麼實作都不會通過，照規則停止。
  - 使用者同意後：
    1. 實作先 stash，回到紅燈。
    2. 照建議修正（c9f515a）：
       - 參考圖測試：放了 2 個視角的照片，改成同意 2 張。
       - 確認定裝版：確認時間改成比對假時鐘當下的時間。
       - 確認後沿用：確認時間改成比對確認回傳的時間。
       - 路由 409：原因改成「包含 price_unknown」。
    3. 放回實作後，參考圖測試還有一處寫錯：假服務照 07 每次付費生成會先要求確認，再帶 `confirm: true` 送一次，所以 2 個視角是 4 次呼叫。回到紅燈，改成只計算確認後送出的那幾次（133bcca）。
    4. 放回實作、切到綠燈，全部通過後才 commit feat。
  - 沒有放寬其他斷言，`.feature` 沒有改。
- `verify-tests-untouched.mjs 133bcca` 通過。
- 提交：
  - `813eaae` test
  - `c9f515a` test（修正 4 個測試）
  - `133bcca` test（參考圖測試只算確認後的呼叫）
  - `77ae929` feat
  - 沒有另外重構。

## 3. 新增的套件與自己取的名稱

| 套件 | 理由 |
| --- | --- |
| `@anthropic-ai/sdk` 0.135.0（server） | 02 指定文字 AI 用 Claude API；官方 SDK，測試用 `baseURL` 指向假服務 |

文件沒寫、自己取的名稱：

- API（05 只列 `generate`、`confirm`）：
  - `GET /api/videos/:id/temple-board`
  - `PATCH /api/videos/:id/temple-board`（外觀規範、光線）
  - `POST /api/videos/:id/temple-board/views/:viewKey/regenerate`
  - `POST /api/videos/:id/temple-board/views/:viewKey/confirm`
  - `POST /api/videos/:id/temple-board/reuse`
  - `POST /api/videos/:id/temple-board/versions`（另存新版本）
- 頁面：`/videos/:vid/studio` 先放 `StudioPage` 佔位，創作工作區在第 6 階段。
- 元件：`ConsentDialog`、`useCostConsent`、`TempleBoardPage`、`ReuseSection`、`ReplaceViewSection`。
- 設定：
  - `workflows` 設定新增 `upload`（上傳工具）與各模型的 `references`（參考圖參數）。正式設定先留空（07 待測），e2e 用 `tests/fakes/comfy-mcp/workflows.e2e.json`。
  - 環境變數：`COMFY_POLL_MS`、`WORKFLOWS_FILE`（`.env.example` 只有名稱）。
  - Claude 模型讀 `CLAUDE_MODEL_ASSIST`，程式裡沒有寫死。
- 預設光線：`TEMPLE_LIGHTING_OPTIONS`，預設「晴天午後」。
- 實作決定：
  - 單筆同意門檻：照字面解讀成整批裡「每一筆生成」各自和門檻比較；本支影片上限與單價待實測則以整批合計判斷。
  - 定裝版的「AI 幫我寫」與外觀規範的 AI 建議：等第 6 階段的 `/api/assist`。

## 4. 對齊檢查

1. **對應的 feature**：F3（模型鎖定）、F5（寺廟定裝版）。
2. **有沒有做到「這一版不做的東西」**：沒有。創作工作區只有佔位頁。
3. **名稱是否一致**：
   - 資料表 `temple_boards`、`temple_board_versions`、`temple_views`、`confirmations` 依 05。
   - 路由 `/videos/:vid/temple-board` 依 03。
   - 05 沒列的端點：見第 3 節。
4. **金鑰或原圖有沒有可能被送出**：
   - 金鑰：
     - 從環境變數讀，`index.ts` 啟動時載入 `.env.local`；程式碼沒有讀 `.env` 的內容去寫紀錄。
     - 測試只用假的金鑰。
   - 原圖：
     - 上傳函式型別只收 `CloudOkAsset`。
     - 「參考圖只上傳去識別後的照片，原圖一次都不送出」有測試。
5. **付費生成能不能不經同意就觸發**：不能。
   - 產生、單張重生都要同意憑證，沒有就回 409 附上預估與原因。
   - 沿用不生成，不花錢。
   - 07 待測的上傳方式與參考圖參數，在正式設定裡沒有填，按下去只說明「待實測」，不會送出。

## 5. 等你處理

- ~~停止原因~~（已處理，c9f515a、133bcca）：4 個單元測試寫錯。
- 實測（正式使用前，要花錢）：
  - `tools/list`：圖片怎麼上傳到 MCP。
  - Nano Banana Pro 的參考圖放在哪個參數。
  - 這兩項填進 `workflows/models.json` 前，正式環境不能產生定裝版；開發與測試不受影響。
- 要你決定：
  - Claude 模型（`CLAUDE_MODEL_ASSIST`）。
  - 單筆同意門檻的解讀：每一筆各自比較，或整批合計。
  - 外觀規範先讓你自己填，還沒有 AI 建議。
