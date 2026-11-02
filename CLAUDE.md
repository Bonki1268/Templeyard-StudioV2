# 廟埕影室（Templeyard Studio）

新北市寺廟觀光短影音的 AI 輔助製作系統，個人本機使用。React + TypeScript 前端、Fastify 後端、SQLite；文字 AI 用 Claude API，圖片與影片一律透過 Comfy Cloud MCP。

這份文件是 Claude Code 的開發規則。回覆、文件、介面文字一律用繁體中文（台灣用語）。

## 一鍵開發

- `/next-stage`：做下一個階段，做完停下來回報。
- `/auto-dev`：從目前階段一路做下去，遇到停止條件才停。`/auto-dev 7` 表示做完第 7 階段就停。
- 進度只看 `docs/PROGRESS.md`。新對話或對話被壓縮後，先讀它再動手。

## 文件地圖

| 檔案 | 內容 | 什麼時候讀 |
| --- | --- | --- |
| `docs/01-PRD.md` | 功能 F1～F22、驗收條件、這一版不做的東西 | 每個階段開始時 |
| `docs/02-TRD.md` | 技術組合、專案結構、Comfy Cloud MCP、費用控制、環境變數 | 每個階段開始時 |
| `docs/03-App-Flow.md` | 路由、按鈕去向、影片階段、確認失效規則 | 有頁面或流程時 |
| `docs/04-UI-UX-Design-Brief.md` | 色彩 token、元件、無障礙、文案規則 | 有畫面時 |
| `docs/05-Backend-Schema.md` | 資料表、API | 有資料或 API 時 |
| `docs/06-Implementation-Plan.md` | 每個階段做什麼、完成條件 | 每個階段開始時 |
| `docs/07-實測紀錄.md` | Comfy Cloud 實測結果（已驗證／待測） | 碰到生成時 |
| `docs/spec/系統規格書.md` | 完整產品規格（v8） | 細節不清楚時 |
| `docs/drama-skills/` | 分鏡、角色一致性、圖片與影片指令寫法（MIT） | 寫生成指令時 |
| `docs/design/*.dc.html` | UI 視覺稿（10 個畫面） | 做畫面時參考；與 04 不一致以 04 為準 |
| `docs/reference/comfyui-test/server.mjs` | 已實測可用的 MCP 用戶端 | 第 4 階段、寫假 MCP 伺服器時 |
| `寺廟資料/新北市寺廟資料.csv` | 寺廟原始資料 | 第 1 階段 |

衝突時：07 的實測結果是事實，01～06 是規格，規格書與設計畫布是參考。文件互相矛盾，或文件與實測矛盾，就停下來回報，不自行決定。

## 每個階段怎麼做（BDD＋TDD）

範圍只看 06 裡這個階段的條列：不提前做後面階段，也不做 01「這一版不做的東西」。

1. **情境**
   - 列出這個階段對應 01 的哪幾個 F，以及 06 的完成條件。
   - 在 `features/stage-NN-<英文名稱>/` 寫 `.feature`，第一行是 `# language: zh-TW`（關鍵字：功能、場景、場景大綱、假設、當、那麼、而且、但是、例子）。
   - 每個 F 的驗收條件至少一個場景；03、05 裡的表格規則寫成「場景大綱」＋「例子」，一列規則一列例子。
   - 執行 `node .claude/scripts/phase.mjs red`；PROGRESS 階段狀態改為「情境」。
2. **紅燈**
   - 寫 step 定義（`tests/e2e/steps/`）、單元測試（`*.test.ts`，放在被測檔案旁）、需要的假服務（`tests/fakes/`）。
   - 可以先建立型別、介面與空函式，但不寫實作。
   - 跑測試：新測試必須全部失敗，而且失敗原因是「還沒實作」，不是語法或設定錯誤。
   - commit `test(第N階段): <摘要>`，把 hash 寫進 PROGRESS 的「測試提交」；階段狀態改為「紅燈」。
3. **綠燈**
   - 執行 `node .claude/scripts/phase.mjs green`；階段狀態改為「綠燈」。從這裡開始不能修改情境、測試、fixtures、假服務（hook 會擋）。
   - 寫剛好讓測試通過的實作；`pnpm test`、`pnpm test:e2e`、`pnpm typecheck`、`pnpm lint` 全部通過。
   - commit `feat(第N階段): <摘要>`。
4. **重構**：測試保持全綠的前提下整理程式，commit `refactor(第N階段): <摘要>`；沒有要整理就略過。
5. **收尾**
   - `node .claude/scripts/verify-tests-untouched.mjs <測試提交>` 必須通過。
   - 寫 `docs/progress/stage-NN.md`（格式見「進度紀錄」），PROGRESS 階段狀態改為「完成」。
   - commit `docs(第N階段): 階段報告`，再執行 `node .claude/scripts/phase.mjs idle`。

### 第 0 階段的特別做法

- 先 `git init`，把現有的檔案 commit 成 `chore: 開工文件與開發設定`。
- 檢查 `pnpm -v`；沒有就執行 `corepack enable`。
- 先搭骨架（02「專案結構」），才有測試工具；接著寫一個冒煙情境（打開首頁看到「廟埕影室」），照紅燈、綠燈的順序走完。
- 建立 `.env.example`（只有變數名稱，沒有值）；把 `寺廟資料/新北市寺廟資料.csv` 複製成 `data/temples.csv`。
- `prompt-studio/`、`prompts/` 在這個 repo 裡找不到時，記進「等你處理」，繼續。
- 06 第 0 階段的實測項目不做（要花錢），留給使用者。

## 測試規則

- **單元測試（Vitest）**：規則寫成純函式，與 IO 分開；至少涵蓋 02「品質與測試」列出的項目。測試名稱用中文描述行為，例如 `it('秒數變動時，成品標示需重新確認')`。
- **情境測試（playwright-bdd）**：使用者看得到的流程與 API 行為。選擇器用 `getByRole`、`getByLabel`、`getByText`，不用 CSS class。
- **外部服務一律用假的**：
  - Comfy Cloud：`tests/fakes/comfy-mcp/`，用 `COMFY_MCP_URL` 指過去。行為照 07 與 `docs/reference/comfyui-test/server.mjs`：初始化與 `Mcp-Session-Id`、session 過期回 404、要求確認、`prompt_id`、`get_job_status`、`get_output`。
  - Claude API：`tests/fakes/claude/`，使用錄製的回應，SDK 用 `baseURL` 指過去。
  - AI 產生的文字不做快照比對，只驗證 Zod schema 與流程。
- 不寫空洞的測試：沒有斷言、斷言恆真、只測 mock 本身、把錯誤吞掉、留下 `.skip`／`.only`。
- 07 標示「待測」的事情（例如圖片怎麼交給 MCP）：寫成介面加上假實作，真實格式不要用猜的；把要驗證的事寫進 PROGRESS「等你處理」。

## 絕對不能做

1. **不花錢**：不執行 `pnpm test:live`，不呼叫真的 Comfy Cloud 或 Claude API。需要實測時寫進「等你處理」，由使用者自己跑。
2. **不碰金鑰**：不讀 `.env`、`.env.local`；金鑰不出現在程式、測試、fixtures、紀錄或 commit 中。
3. **原圖不上雲**：送往 Comfy Cloud 的函式，型別上只收 `cloud_ok` 的資產（02「去識別」）。
4. **綠燈之後不改測試**。
5. **不改規格來配合實作**：01～07 與規格書的內容不動，有問題寫進「等你處理」。`docs/PROGRESS.md` 與 `docs/progress/` 由你維護。
6. **不做破壞性操作**：不 `git push --force`、不 `git reset --hard`、不刪除使用者的檔案；使用者沒要求就不 push。
7. **不加入 02 以外的大型框架**；小套件可以加，在階段報告列出理由。

## 停下來的條件

遇到以下情況，把狀況寫進 PROGRESS「等你處理」與階段報告，階段狀態改為「停止」，不要繞過：

- 文件互相矛盾，或規格不足以寫出測試。
- 需要花錢、需要金鑰、需要使用者的照片或帳號。
- 同一組測試修了 3 輪仍失敗，或你認為測試本身寫錯。
- 這個階段的核心功能依賴 07 的待測事項，而且沒辦法用介面加假實作隔開。
- 需要刪除檔案，或要改動 repo 以外的東西。

找不到但不阻擋進度的東西，記進「等你處理」後繼續。

## 程式慣例

- TypeScript `strict`；不用 `any`，真的需要時用 `unknown` 再收斂型別。
- 所有邊界（API 請求、外部回應、Claude 工具輸出、prompt JSON）都用 Zod 驗證；schema 放 `packages/shared`。
- 識別字、檔名、資料表欄位用英文（依 05）；介面文字與錯誤訊息用繁體中文台灣用語（依 04 文案規則）；註解用中文。
- 資料表、路由、元件名稱與 03、04、05 一致；文件沒寫、你自己取的名稱要列在階段報告。
- 樣式只用 04 的 token（CSS 變數），不寫死色值。
- 模型代號、範本名稱、節點編號放 `workflows/` 的設定檔，不寫死在程式裡。

## 指令

| 指令 | 用途 |
| --- | --- |
| `pnpm dev` | 同時啟動前後端 |
| `pnpm test` | Vitest 單元與整合測試 |
| `pnpm test:e2e` | playwright-bdd 情境測試（自動啟動假服務） |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test:live` | 真的呼叫外部服務，只有使用者能執行 |

這些指令在第 0 階段建立，之後不要改變它們的意思。

## Commit

- 每個階段至少有 `test(第N階段)`、`feat(第N階段)`、`docs(第N階段)` 三個 commit；`refactor(第N階段)` 可選。
- commit 前確認沒有加入 `.env*`（`.env.example` 除外）、`data/app.db`、`data/assets/`。

## 進度紀錄

`docs/PROGRESS.md` 開頭的「目前階段」「階段狀態」「測試提交」三行是給指令讀的，格式不要改。

- 階段狀態依序是：未開始 → 情境 → 紅燈 → 綠燈 → 完成；中途停下來就是「停止」。
- 「目前階段」只由 `/next-stage` 或 `/auto-dev` 在稽核通過後往前推進。

階段報告 `docs/progress/stage-NN.md` 的內容：

1. 對應的 F 與 06 的完成條件，逐條打勾
2. 情境與測試清單：數量、紅燈時失敗數、綠燈時通過數
3. 新增的套件與理由；文件沒寫、你自己取的名稱
4. 對齊檢查 5 問的回答（06 最後一節）
5. 等你處理
6. 稽核結果（由稽核者填寫）
