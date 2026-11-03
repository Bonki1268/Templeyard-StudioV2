# 第 8 階段：角色定裝版、補充視角

狀態：**完成**。中途停止一次：第 7 階段一個情境和本階段的規則衝突，使用者同意後回到紅燈修正。

## 1. 對應的 F 與完成條件

| 項目 | 狀態 |
| --- | --- |
| F10 角色定裝版：建立新角色，產生三視圖與定裝圖；角色確認後才能生成精緻圖 | 完成。沿用系列角色也做了：設為系列角色後，同系列下一支影片同名的角色直接沿用 |
| F11 補充視角：卡片標示「缺少視角」，補產生並確認後才可生成 | 完成。確認後，用到這個視角的格子改用新的視角，存成新版本 |
| 06：新角色的描述與連續性鎖（AI 幫我寫）、產生三視圖與定裝圖、確認、設為系列角色 | 完成。AI 幫我寫用 Prompt Studio 的 character-design 節點 |
| 06：補充視角：卡片標示缺少視角，補產生並確認 | 完成 |
| 完成條件：角色未確認或缺少視角時不能生成 | 完成（`characters.test.ts`、`character.feature`、`supplemental-view.feature`、`plan-check.feature`） |
| 完成條件：連續性鎖確實出現在後續指令中（指令組裝測試） | 完成（`frames/framePrompt.test.ts`：refined-frame 帶入的變數、撰寫後的最終指令都有每一條鎖；漏掉時要求重寫，仍漏掉就回報錯誤）。三視圖與定裝圖的最終指令也有測試 |
| 第 7 階段稽核建議 | 完成：`shots.character_ids` 改存角色編號；「卡片標紅」加上外框顏色的驗證 |

## 2. 情境與測試

| 類別 | 檔案 | 數量 | 紅燈時 | 綠燈時 |
| --- | --- | --- | --- | --- |
| 情境 | `character.feature` | 11（含場景大綱 4 例） | 全部失敗 | 通過 |
| 情境 | `supplemental-view.feature` | 7（含場景大綱 4 例） | 全部失敗 | 通過 |
| 情境 | 第 7 階段 `plan-check.feature`：「對白放不下」加上外框顏色的驗證 | 改 1 個 | 通過（補強既有行為的斷言） | 通過 |
| 情境 | 第 7 階段 `plan-check.feature`：「只剩精緻圖生成」先確認角色（停止後修正） | 改 1 個 | — | 通過 |
| 單元 | shared `characters`、`plans`（缺少的視角） | 9 | 8 失敗 | 全部通過 |
| 單元 | agent `assist`（character-design） | 3 | 2 失敗 | 全部通過 |
| 單元／整合 | server `characters/service`、`routes/characters`、`plans/characters`、`templeBoards/supplemental`、`frames/framePrompt`、`assist/service` | 47 | 全部失敗 | 全部通過 |

- 紅燈（b7eefb9）：
  - 單元測試共 928 個：57 個失敗、871 個通過。
  - 情境共 243 個：18 個失敗、225 個通過。
  - 失敗原因都是「尚未實作」：空函式丟出例外、路由回 404。
  - `plans` 的兩個測試改成預期視角多了 source／confirmed／state 欄位。
- 停止與修正：
  - 第一次綠燈時，第 7 階段「秒數檢查全部通過時，只剩精緻圖生成還沒開放」失敗了：方案的「阿嬤」還沒確認，原因多了一條。照規則停止。
  - 使用者同意後：實作先 stash，回到紅燈，在這個場景加上「我已經透過 API 產生並確認「阿嬤」的定裝圖」，原本的斷言不變（9afd65b）。
- 綠燈（2e778a7）：
  - `pnpm test` 928 個全部通過。
  - `pnpm test:e2e` 243 個連跑 3 次全部通過。
  - `pnpm typecheck`、`pnpm lint` 通過；Prompt Studio 14 個測試通過。
- 綠燈時修的實作問題：第 6 階段的情境偶爾失敗。原因是 Agent 回覆結束、對話重新讀取完成之前，串流中的回覆和存下來的回覆會同時出現一下。改成串流結束就換成存下來的訊息，並依訊息編號去掉重複。
- `verify-tests-untouched.mjs 9afd65b` 通過。
- 提交：`b7eefb9` test、`9afd65b` test（修正衝突的情境）、`2e778a7` feat；沒有另外重構。

## 3. 新增的套件與自己取的名稱

沒有新增套件。

文件沒寫、自己取的名稱：

- API：
  - `GET /api/videos/:id/characters`：這支影片能用的角色。
  - `PATCH /api/characters/:cid`：修改外觀描述與連續性鎖。
  - `POST /api/characters/:cid/generate`：產生三視圖與定裝圖。
  - `POST /api/characters/:cid/confirm`：確認角色。
  - `POST /api/characters/:cid/series`：設為系列角色。
  - `POST /api/videos/:id/temple-board/supplemental-views`：補充視角。
  - `POST /api/videos/:id/temple-board/supplemental-views/:viewKey/confirm`：確認補充的視角。
- 補充視角的 viewKey：`custom:<名稱>`。方案裡缺少的視角仍寫成 `missing:<名稱>`。
- 角色狀態：`draft`（待產生定裝圖）、`generating`、`pending_confirm`（待確認）、`confirmed`、`failed`。
- AI 幫我寫的欄位：`character.description`、`character.locks`，用 character-design 節點。
- 元件：`CharacterCard`；`frames/framePrompt.ts`（`frameLocks`、`refinedFrameVariables`）。第 9 階段生成精緻圖時使用。
- 實作決定：
  - 三視圖與定裝圖同一批送出，同意 2 張的費用。兩張都只用文字，不用參考圖。
    - 定裝圖沒有拿三視圖當參考，因為同一批時三視圖還沒產生。
    - 好處是不受 07「圖片怎麼上傳到 MCP」待測的影響，正式環境也能產生。
    - 之後實測了上傳方式，可以改成先產生三視圖，再拿它當定裝圖的參考。
  - 角色確認後再改外觀描述：另存新版本，要重新產生定裝圖。還沒確認時直接改這一版。
  - 設為系列角色要先確認。同系列的影片依名稱沿用系列角色。
  - 方案的角色：資料庫存角色編號，API 與畫面仍用角色名稱。方案寫了新的角色名稱時，建立影片專屬角色，外觀描述留白，要使用者填寫。
  - 第 7 階段已存的方案，`character_ids` 存的是名稱。讀取時找不到對應的編號就原樣顯示，沒有另外搬移舊資料。
  - 補充視角加在這支影片使用的定裝版上，即使這個版本已經確認，並記下是哪支影片補充的。它以 AI 推測產生，需要參考其他照片，所以和定裝版一樣要先實測上傳方式；在那之前，正式環境會說明「待實測」。
  - 角色定裝圖或補充視角生成中時，方案面板每 1.5 秒重新讀取，完成後停止。

## 4. 對齊檢查

1. **對應的 feature**：F10、F11。F18 補上了角色的外觀描述與連續性鎖。
2. **有沒有做到「這一版不做的東西」**：沒有。
3. **名稱是否一致**：
   - 資料表 `characters`、`character_versions` 的欄位依 05。
   - `shots.character_ids` 改存角色編號，依 05。
   - `temple_views.created_from_video_id` 記下是哪支影片補充的。
   - 05 沒列的端點：見第 3 節。
4. **金鑰或原圖有沒有可能被送出**：
   - 角色定裝圖只送文字。
   - 補充視角沿用定裝版的上傳流程，型別上只收 `cloud_ok` 的去識別照片。
   - 測試只用假的 MCP 與假的 Claude。
5. **付費生成能不能不經同意就觸發**：不能。
   - 產生定裝圖與補充視角，都要先取得同意憑證。
   - 沒有憑證時回 409，不送出也不留紀錄（有測試）。
   - Agent 的工具仍然沒有付費工具。

## 5. 等你處理

- 實測（要花錢）：
  - 圖片怎麼上傳到 MCP、Nano Banana Pro 的參考圖參數。這兩項會影響補充視角，以及之後角色定裝圖改用三視圖當參考。
- 要你決定：
  - 定裝圖目前不拿三視圖當參考（見第 3 節），實測後要不要改成兩段。
  - 第 7 階段已存方案的 `character_ids` 是名稱，沒有搬移舊資料；有需要再告訴我。
