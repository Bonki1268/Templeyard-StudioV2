# 第 4 階段：Comfy Cloud MCP 轉接層、生成指令組裝、費用控制

狀態：**完成**（中途因 1 個單元測試檔互相干擾停止一次，使用者同意後回到紅燈修正）

## 1. 對應的 F 與完成條件

| 項目 | 狀態 |
| --- | --- |
| F19 費用控制：預估、預留、結算、單筆門檻與本支影片上限、同意後才帶 `confirm: true` | 完成；實際扣點先以預估結算（待實測） |
| F20 生成指令管理：呼叫綁定欄位與驗證、模型寫法、連續性鎖預覽 | 完成 |
| 06：`packages/comfy-client` 初始化、session 過期重連、`partner_generate`／`run_template`、雲端確認、輪詢、`get_output`、錯誤處理、同時執行數佇列、中斷恢復 | 完成；「圖片輸入」只有介面與假實作（07 待測） |
| 06：`workflows/` 各模型的呼叫設定 | 完成（`workflows/models.json`） |
| 06：`packages/prompts` 讀 prompt JSON、模型寫法、連續性鎖、單格自訂指令優先、呼叫綁定 | 完成 |
| 06：Prompt Studio 擴充（呼叫綁定、新節點、16:9） | 完成 |
| 06 完成條件：假 MCP 伺服器測試涵蓋成功、失敗、逾時、session 過期、雲端要求確認、重啟後取回 | 完成（`client.test.ts`、`service.test.ts`） |
| 06 完成條件：指令組裝的快照測試 | 完成（`compose.test.ts` 對 `__fixtures__/temple-view.nano-banana-pro.json` 固定輸出；這是組裝結果，不是 AI 文字） |
| 06 完成條件：費用超過上限時 API 回傳「需要同意」 | 完成（`routes/costs.test.ts`、`cost-control.feature`） |
| 第 3 階段稽核建議（4 項中的 3 項） | 完成，見第 2 節；Prompt Studio 要不要加 lint 仍等你決定 |

## 2. 情境與測試

| 類別 | 檔案 | 數量 | 紅燈時 | 綠燈時 |
| --- | --- | --- | --- | --- |
| 情境 | `cost-control.feature` | 14（含場景大綱 12 例） | 13 失敗、1 通過 | 14 通過 |
| 情境 | `prompt-studio.feature` | 17（含場景大綱 12 例） | 16 失敗、1 通過 | 17 通過 |
| 情境 | 第 3 階段補上：`create-video.feature` 新增 1 個、`photo-deid.feature` 改 1 個 | 2 | 通過（補既有行為） | 通過 |
| 單元 | comfy-client `client`、`queue`、`results` | 40 | 全部失敗 | 全部通過 |
| 單元 | prompts `bindings`、`compose`、`load`、`locks`、`render` | 47 | 全部失敗 | 全部通過 |
| 單元／整合 | server `costs/*`、`generations/service`、`routes/costs` | 45 | 全部失敗 | 全部通過 |
| 單元 | shared `costs.test.ts` | 3 | 全部失敗 | 全部通過 |
| 整合 | `routes/videos.test.ts` 新增 3 個（costLimit） | 3 | 1 失敗（沒有存下來）、2 通過（schema 已在紅燈建立） | 全部通過 |
| 單元 | Prompt Studio `node --test` | 14 | 新增的失敗 | 14 通過 |

- 紅燈：
  - 新的單元與整合測試有 136 個失敗，情境有 29 個失敗。原因都是「尚未實作」：空函式丟出例外、路由回 404。
  - 紅燈時就通過的：
    - 2 個情境：費用設定 400 的第 1 例、Prompt Studio 原有的儲存驗證。前者是 schema 已在紅燈建立，後者是既有行為。
    - 2 個 costLimit 400 的整合測試，原因同上（schema 已建立）。
    - 第 3 階段補上的 2 個情境，因為補的是既有行為。
- 綠燈：
  - `pnpm test` 452 個全部通過，連跑 3 次都一樣，沒有不穩定。
  - `pnpm test:e2e` 118 個全部通過。
  - `pnpm typecheck`、`pnpm lint` 通過；Prompt Studio 14 個測試通過。
- 停止與修正的經過：
  - 第一次綠燈時，`service.test.ts` 的測試會互相干擾：「付費生成前的同意」有兩個測試送出任務後沒等它結束，背景輪詢在測試結束後繼續推進共用的假時間，下一個測試因此逾時。照規則停止。
  - 使用者同意後的處理順序：
    1. 先把實作 stash 起來，回到紅燈。
    2. 這兩個測試改成等任務結束（`whenSettled`），沒有放寬任何斷言。
    3. 一併補上第 3 階段稽核的建議：
       - 「系列不存在」的頁面情境。
       - 「不儲存，關閉」加上對話框已關閉、重新打開後沒有標示已取消。
       - 步驟列、寺廟資料卡、拍到的視角、BottomActionBar 測試改用以角色為主的查詢。
    4. commit `3fdb7c5`。
    5. 把實作放回來、切到綠燈，全部通過後才 commit feat（照第 3 階段稽核的建議：全綠才 commit feat）。
- `verify-tests-untouched.mjs 3fdb7c5` 通過。測試提交改成修正後的這一個。
- 提交：
  - `7a01a71` test
  - `3fdb7c5` test（修正互相干擾，補第 3 階段稽核的建議）
  - `1e1cf03` feat
  - 沒有另外重構。

## 3. 新增的套件與自己取的名稱

| 套件 | 理由 |
| --- | --- |
| `@templeyard/prompts`（workspace 內部套件） | 02 專案結構的 `packages/prompts` |
| server 新增依賴 `@templeyard/comfy-client`、`@templeyard/prompts` | workspace 內部套件 |

沒有新增外部套件。

文件沒寫、自己取的名稱：

- API（05 只寫「生成需帶同意憑證」）：
  - `POST /api/videos/:id/cost-estimate`：預估，並回傳需不需要同意與原因。
  - `POST /api/videos/:id/consents`：發同意憑證。憑證一次性，10 分鐘有效，存在記憶體裡，重啟後重新同意。
  - `GET /api/videos/:id/cost`：這支影片目前的預留、已花費、上限。
  - `GET/PATCH /api/settings`：單筆同意門檻等設定。
  - Prompt Studio `GET /api/workflows`。
- 設定鍵：`consentThresholdCredits`。
- 需要同意的原因代碼：`over_threshold`、`over_limit`、`price_unknown`，在 `packages/shared/src/costs.ts`。
- 檔案：
  - `workflows/models.json`：各模型的 `tool`、`args`、`slots`、`price`、`status`。
  - `packages/prompts/src/values.ts`：組裝用的值。
- 實作決定：
  - `submit()` 有空位時，等拿到 prompt_id 才回應。
  - prompt JSON 直接加上呼叫綁定，沒有升版本。
  - 門檻與上限沒設定時，每次都要同意。
  - 單價待實測的模型一定要同意。
  - 實際扣點先以預估結算。

## 4. 對齊檢查

1. **對應的 feature**：
   - F19：費用控制。
   - F20：生成指令管理的擴充。
   - F21 的基礎：生成紀錄、prompt_id 追蹤、中斷恢復。畫面在第 9 階段。
2. **有沒有做到「這一版不做的東西」**：沒有。
3. **名稱是否一致**：
   - 一致的部分：資料表 `generations`、`settings`、`videos.cost_limit` 欄位依 05；節點代號依 02 與 Prompt Studio。
   - 05 沒列的端點：見第 3 節。
4. **金鑰或原圖有沒有可能被送出**：
   - 金鑰：
     - 生成服務還沒接到啟動程式，金鑰由呼叫端傳給 `createMcpSession`；程式裡沒有寫死金鑰，也沒有讀 `.env`。
     - 金鑰不寫進 `generations.input`，「紀錄裡沒有金鑰」有測試。
     - 測試只用假的金鑰 `FAKE_API_KEY`。
   - 原圖：
     - 這階段的生成都是文字指令；圖片輸入只有介面，型別只收 `CloudOkAsset`。
5. **付費生成能不能不經同意就觸發**：不能，有三道關卡：
   - 超過門檻或上限、單價待實測的模型，沒有一次性同意憑證就不送出，也不留紀錄。
   - 雲端要求確認時，只有本系統的同意檢查通過後，才帶 `confirm: true`。
   - 重啟時沒拿到 prompt_id 的紀錄標示失敗，不自動重送。

## 5. 等你處理

- ~~停止原因~~（已處理，3fdb7c5）：`service.test.ts` 測試互相干擾。
- 實測（會擋住「實際扣點」與「圖片輸入」的真實格式，不擋第 5 階段開發）：
  - `tools/list`：圖片怎麼交給 MCP。
  - Gemini 首格＋末格＋參考圖。
  - 各模型的實際扣點與參考單價。
- 每支影片的費用上限與單筆同意門檻的預設值，請你決定。目前沒設定時，每次都要同意。
- 第 4 節實作決定的五項，要改請告訴我。
- Prompt Studio 要不要另外加 lint，請你決定。

## 6. 稽核結果

（由稽核者填寫）
