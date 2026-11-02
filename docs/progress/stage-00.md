# 第 0 階段報告：實測與專案骨架

日期：2026-11-02 · 開發者：主代理（Claude Code）

## 1. 對應的 F 與完成條件

第 0 階段是專案骨架，沒有直接對應 01 PRD 的 F1～F22。06 的完成條件：

- [x] `pnpm dev` 能同時啟動前後端並顯示首頁：實際啟動後，`http://127.0.0.1:5173/` 回應頁面（標題「廟埕影室」），`/api/health` 經前端代理回 `{"status":"ok"}`，後端在 3001。
- [x] `pnpm test`、`pnpm typecheck`、`pnpm lint` 全部通過（另外 `pnpm test:e2e` 也通過）。
- [ ] 實測紀錄已寫入：依 CLAUDE.md，第 0 階段的實測要花錢，不由 Claude 執行，已列在 PROGRESS「等你處理／實測」。
- [ ] 把既有的 `prompt-studio/` 與 `prompts/` 搬進 repo、確認 8 項測試通過：repo 裡找不到這兩個資料夾，已列進「等你處理」。

其他第 0 階段的工作：

- [x] pnpm monorepo：`apps/web`、`apps/server`、`packages/shared`
- [x] TypeScript strict、ESLint、Vitest、Playwright＋playwright-bdd
- [x] `.env.example`（只有變數名稱）
- [x] `寺廟資料/新北市寺廟資料.csv` 複製為 `data/temples.csv`（內容一致）

## 2. 情境與測試

| 類別 | 檔案 | 數量 | 紅燈時失敗 | 綠燈時通過 |
| --- | --- | --- | --- | --- |
| 情境 | `features/stage-00-smoke/smoke.feature` | 2 個場景 | 2（找不到標題；`/api/health` 回 404） | 2 |
| 單元 | `apps/server/src/app.test.ts` | 1 | 1（404 ≠ 200） | 1 |
| 單元 | `apps/web/src/App.test.tsx` | 1 | 1（找不到主標題「廟埕影室」） | 1 |

紅燈時的失敗原因都是「還沒實作」。中途遇過兩個設定問題，都是在紅燈 commit 之前修好的，不是測試寫錯：

1. Vitest 從根目錄解析不到只裝在 `apps/web` 的 `react`，所以各專案改用自己的資料夾當根目錄。
2. Node 22.11 不能 `require()` ESM，Fastify 的 `inject` 因此失敗，改成鎖定 `light-my-request` 的版本。

`vitest.config.ts` 在綠燈時有一處修正：拿掉放錯層級的 `passWithNoTests`，它會造成型別錯誤。這個檔案是設定檔，不在受保護的測試路徑內，測試內容沒有改變。

提交：

- `c4bd768` chore(第0階段)：專案骨架與測試工具
- `af9f163` test(第0階段)：測試提交
- `a795867` feat(第0階段)：實作
- 這次沒有 refactor commit，因為沒有需要整理的地方。

`verify-tests-untouched.mjs af9f163` 已通過。

## 3. 新增的套件與自己取的名稱

套件（都在 02 的技術組合內，或是它們的必要工具）：

| 套件 | 版本 | 理由 |
| --- | --- | --- |
| react、react-dom | 18.3.1 | 02 指定 React 18 |
| react-router | 7.18.5 | 02「React Router」；8.x 要求 React 19 |
| vite、@vitejs/plugin-react | 6.4.5、4.7.0 | Vite 8 要求 Node ≥22.12，本機是 22.11 |
| vitest、jsdom | 3.2.7、26.1.0 | Vitest 5 要求 Node ≥22.12 |
| @testing-library/react、dom、jest-dom | 16.3.3、10.4.2、6.x | 前端元件的單元測試 |
| @playwright/test、playwright-bdd | 1.64.1、9.2.1 | 02 測試工具、CLAUDE.md 情境測試 |
| fastify | 5.12.8 | 02 後端 |
| zod | 4.6.7 | 02 驗證，schema 放在 `packages/shared` |
| typescript | 5.9.3 | typescript-eslint 還不支援 TS 7 |
| eslint、@eslint/js、typescript-eslint、eslint-plugin-react-hooks、globals | 9.x 等 | lint |
| tsx | 4.23.15 | 後端開發時直接執行 TypeScript（小套件） |
| concurrently | 9.2.5 | `pnpm dev` 同時啟動前後端（小套件） |

`pnpm.overrides`：`light-my-request` 鎖在 6.6.0，原因見「等你處理」。

文件沒寫、我自己取的名稱：

- 路由 `GET /api/health`，回應 `{ status: 'ok' }`；schema 是 `healthResponseSchema`（`packages/shared/src/health.ts`）
- 元件 `SeriesHomePage`（對應 03 的「/ 系列首頁」）
- 環境變數 `API_PORT`（預設 3001）、`WEB_PORT`（預設 5173）；情境測試固定用 3101／5174，不和 `pnpm dev` 衝突
- `pnpm test:live` 讀取 `vitest.live.config.ts`，只跑 `*.live.test.ts`，目前沒有任何實測
- 間距、圓角、字體的 CSS 變數（`--space-*`、`--radius-*`、`--font-*`）：04 只給數值，名稱是我取的

這一版先沒有建立 `packages/comfy-client`、`agent`、`prompts` 與 `workflows/`，留到用到它們的階段（第 4、6 階段）再建，避免空殼套件。

## 4. 對齊檢查

1. **對應哪幾個 F？** 沒有直接對應；這個階段是骨架與冒煙測試。首頁路由 `/` 是 F1「系列首頁」的入口，內容留到第 2 階段。
2. **有沒有做到「這一版不做的東西」？** 沒有。
3. **名稱是否與 03、04、05 一致？** 路由 `/` 和 03 一致；色彩 token 名稱和 04 一致，樣式只用 CSS 變數。這個階段沒有資料表。
4. **金鑰或原圖會不會被送出、寫進紀錄？** 不會。`.env.example` 只有變數名稱；程式沒有讀取任何金鑰；`.gitignore` 排除 `.env*`、`data/app.db`、`data/assets/`。這個階段沒有任何外部呼叫。
5. **付費生成能不能不經同意就觸發？** 不能，這個階段沒有任何生成功能。`pnpm test:live` 沒有被執行。

## 5. 等你處理

- `prompt-studio/` 與 `prompts/` 不在 repo 裡（最晚第 4 階段前）
- 建議把 Node 升到 22.12 以上，升級後可以拿掉 `light-my-request` 的 override，也可以改用新版 Vite／Vitest
- 02 寫 Node.js 20，但 Playwright 1.64 要求 Node ≥22：是否更新 02 由你決定
- 第 0 階段的實測項目（見 PROGRESS「實測」）

## 6. 稽核結果

（由稽核者填寫）
