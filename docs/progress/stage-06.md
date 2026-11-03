# 第 6 階段：創作 Agent、對話、問卷、AI 輔助撰寫

狀態：**完成**

## 1. 對應的 F 與完成條件

| 項目 | 狀態 |
| --- | --- |
| F6 創作對話：一句話說出想做什麼、快捷標籤帶入開頭；Agent 回覆說明下一步並開啟問卷 | 完成 |
| F7 設定問卷：點選項或自己寫、留白由系統決定；第一支影片的答案存成系列預設；每支影片不同的題目不沿用 | 完成；「建立分鏡方案」送出問卷後，分鏡方案在第 7 階段才產生，畫面說明「分鏡方案將在之後的版本開放」 |
| F18 AI 輔助撰寫：先顯示「AI 建議」，按「採用」才填入；不會自動送出或觸發生成 | 完成（第 1～4 步的欄位） |
| 06：`packages/agent`：Claude 工具定義（查詢寺廟、讀取系列、產生問卷、預估費用）；付費工具需同意憑證 | 完成；第 6 階段沒有付費工具，同意憑證的關卡在工具清單裡，以測試用的付費工具驗證 |
| 06：創作工作區版面：左對話（SSE 串流）、右面板切換 | 完成；面板選單到達過的可以切回，還沒到達的不能選並說明「還沒到這一步」 |
| 06：創作首頁、問卷面板（選項＋或自己寫、留白由系統選、答案來源標籤）、系列問卷預設值 | 完成 |
| 06：通用的「AI 幫我寫」元件與 `/api/assist`，接上第 1～4 步的欄位 | 完成：系列「整體視覺風格」、建立影片「AI 整理成條列」、定裝版「修改這張」、創作首頁、問卷「想講的故事」「一定要說到的事」「或自己寫」 |
| 完成條件：以錄製回應測試 Agent 工具流程 | 完成（`tests/fakes/claude/recordings.json` 加上 tool_use 的錄製回應；`claude.test.ts`、`chat.test.ts`、`routes/studio.test.ts`、情境） |
| 完成條件：第一支影片送出問卷後系列預設值被寫入、第二支影片自動帶入 | 完成（`questionnaire.feature`、`questionnaire.test.ts`） |
| 完成條件：AI 建議只有按「採用」才會填入 | 完成（`ai-assist.feature`、`assist/service.test.ts`） |
| 第 5 階段稽核建議 | 完成：參考圖測試驗證每個視角第一張是自己的去識別照片、參考圖都是去識別照片的雲端參照；確認時間改成比對字面值；`reuse.feature` 補上「當」 |
| 第 5 階段留下的「定裝版 AI 幫我寫」 | 完成（第 5 階段稽核第 3 條的落差，這階段接上） |

## 2. 情境與測試

| 類別 | 檔案 | 數量 | 紅燈時 | 綠燈時 |
| --- | --- | --- | --- | --- |
| 情境 | `studio-chat.feature` | 17（含場景大綱 8 例） | 全部失敗 | 通過 |
| 情境 | `questionnaire.feature` | 15（含場景大綱 7 例） | 全部失敗 | 通過 |
| 情境 | `ai-assist.feature` | 17（含場景大綱 11 例） | 全部失敗 | 通過 |
| 情境 | 移除第 2、3 階段「AI 幫我寫還沒開放」2 個；`board-page.feature` 拿掉「AI 幫我寫不能按」一行；`reuse.feature` 補「當」 | -2 | — | — |
| 單元 | shared `questionnaire`、`chat`、`sse` | 41 | 全部失敗 | 全部通過 |
| 單元／整合 | agent `tools`、`loop`、`claude`（假的 Claude API）、`system`、`assist` | 43 | 全部失敗 | 全部通過 |
| 單元／整合 | server `studio/questionnaire`、`studio/chat`、`studio/agentTools`、`assist/service`、`routes/studio`、`routes/assist`、`runtime/env`（新增 4） | 87 | 全部失敗 | 全部通過 |
| 單元 | web `panels`、`questionnaireForm`、`chatStream`、`AiSuggestion`、`OptionGroup`（新增 2） | 28 | 全部失敗 | 全部通過 |
| 單元 | 第 5 階段稽核補強：`templeBoards/service.test.ts` 3 個 | 3 | 通過（補強既有行為的斷言） | 通過 |

- 紅燈（876ad37）：
  - 單元測試共 758 個：187 個失敗、571 個通過（通過的是既有測試與第 5 階段的補強）。
  - 情境共 194 個：新的 49 個全部失敗、舊的 145 個通過。
  - 失敗原因都是「尚未實作」：空函式丟出例外、路由回 404、畫面沒有元素。
  - `routes/videos.test.ts` 建立草稿的預期多了 `creativeInput: null`（影片 schema 新增欄位）。
- 綠燈（ee35d86）：
  - `pnpm test` 766 個全部通過。
  - `pnpm test:e2e` 194 個全部通過，連跑 2 次都一樣。
  - `pnpm typecheck`、`pnpm lint` 通過；Prompt Studio 14 個測試通過。
  - 綠燈時修的實作問題：「AI 幫我寫」按鈕原本用 `aria-label`，名稱含「或自己寫」，會被當成「或自己寫」輸入框的標籤。改成用隱藏文字提供完整名稱，按鈕名稱不變。
- `verify-tests-untouched.mjs 876ad37` 通過。
- 提交：`876ad37` test、`ee35d86` feat；沒有另外重構。

## 3. 新增的套件與自己取的名稱

| 套件 | 理由 |
| --- | --- |
| `@templeyard/agent`（workspace 內部套件） | 02 專案結構的 `packages/agent` |
| agent 依賴 `@anthropic-ai/sdk` 0.135.0 | 與 server 同一個版本（第 5 階段已加入） |

沒有新增外部套件。

文件沒寫、自己取的名稱：

- API（05 只列 `POST /api/videos/:id/chat`、`PUT /api/videos/:id/questionnaire`、`POST /api/assist`）：
  - `GET /api/videos/:id/chat`：對話紀錄。
  - `GET /api/videos/:id/questionnaire`：問卷，還沒開啟時是 null。
  - `GET /api/assist/:id`：查看一筆 AI 建議。
  - `POST /api/assist/:id/adopt`：使用者按下「採用」。
- SSE 事件：`user`、`text`、`tool`、`done`、`error`（`packages/shared/src/chat.ts`）。
- Agent 工具：`search_temples`、`read_series`、`generate_questionnaire`、`estimate_cost`。
- 題目代號：`story`、`goal`、`audience`、`narration`、`character`、`tone`、`length`、`photos`、`mustSay`。
- 答案欄位 `photoIds`：「一定要出現的照片」勾選的照片。05 的答案只寫了 `choice`、`custom`。
- AI 幫我寫的欄位代號：`series.visualStyle`、`video.templeNotes`、`templeView.instruction`、`creative.input`、`questionnaire.story`、`questionnaire.mustSay`、`questionnaire.custom`。
- 快捷標籤帶入的句子開頭，例如「我想講〔廟名〕的歷史故事：」。
- 元件與檔案：
  - `ChatColumn`、`HomePanel`、`QuestionnairePanel`、`AiSuggestion`、`useAiAssist`、`useStudioChat`。
  - `apps/server/src/studio/`、`apps/server/src/assist/`。
- 資料表：`ai_assist_logs.series_id` 可以是 null。系列表單建立系列前就能按「AI 幫我寫」，那時還沒有系列。
- 環境變數：文字 AI 只需要 `ANTHROPIC_API_KEY`、`CLAUDE_MODEL_AGENT`、`CLAUDE_MODEL_ASSIST`，不需要 Comfy Cloud。缺少時，對話與 AI 幫我寫回 503 並說明缺少哪些。
- 實作決定：
  - 「系列設定」的預填只對應影片秒數 →「長度」，標示「系列預設」。05 的答案來源只有 user／series_default／system，所以沒有另外的「系列設定」標籤。
  - 系列問卷預設值只在預設值是空的時候寫入；全部留白時不寫。
  - 問卷送出後可以再送出（分鏡方案建立前），預設值不會再改；送出後 Agent 不能重新產生問卷。
  - 送出問卷時，左欄記一則使用者訊息「送出問卷」，下面每題一行答案摘要。
  - 影片階段：Agent 開啟問卷時從 chat 進到 questionnaire。送出問卷後仍是 questionnaire，等第 7 階段產生方案 v1 時才進到 plan。
  - 「想講的故事」用 Prompt Studio 的 copy-polish 節點；其他欄位用 `packages/agent` 的通用輔助撰寫指令（`prompt-studio/README.md`：通用的 AI 輔助撰寫不在 Prompt Studio）。
  - 採用「寺廟歷史與簡介」的建議時，會一併儲存這個欄位，和離開欄位時自動儲存一樣。

## 4. 對齊檢查

1. **對應的 feature**：F6、F7、F18（第 1～4 步）。F3、F5 的定裝版頁也接上了 AI 幫我寫。
2. **有沒有做到「這一版不做的東西」**：沒有。
3. **名稱是否一致**：
   - 資料表 `chat_messages`、`questionnaires`、`ai_assist_logs` 依 05。
   - 路由 `/videos/:vid/studio?panel=home|questionnaire|plan|frames|final` 依 03。
   - 05 沒列的端點：見第 3 節。
4. **金鑰或原圖有沒有可能被送出**：
   - 金鑰：
     - 從環境變數讀；錯誤訊息只說要檢查 `ANTHROPIC_API_KEY`，不含值。
     - 測試只用假的金鑰，SDK 的 `baseURL` 指向假的 Claude API。
   - 原圖：這階段送給 Claude 的只有文字（寺廟資料、使用者輸入、問卷），沒有圖片。
5. **付費生成能不能不經同意就觸發**：不能。
   - Agent 只有不花錢的四個工具。
   - 工具清單對 `paid` 的工具一律檢查同意憑證；對話不帶憑證，所以不會執行。
   - 「對話不會產生任何生成紀錄」有測試。
   - AI 幫我寫只產生建議，不會改動其他資料，也不會產生生成紀錄。

## 5. 等你處理

- 要你決定（不擋第 7 階段）：
  - Claude 模型：`CLAUDE_MODEL_AGENT`、`CLAUDE_MODEL_ASSIST`。01「待決定」排在第 6 階段前；程式沒有寫死，填進 `.env.local` 就能用。
  - 02 寫 Claude 的使用「每次呼叫寫入 generations，記錄 token 用量與費用」，06 沒有排在哪個階段。目前 Agent 與 AI 幫我寫都不寫生成紀錄。要排在哪個階段請你決定。
- 實測（要花錢，只有你能跑）：用真的 Claude 跑一次創作對話，確認 Agent 會先說明再呼叫 `generate_questionnaire`，問卷的預填合理。
