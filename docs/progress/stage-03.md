# 第 3 階段：建立影片、照片上傳與去識別

狀態：**停止**（綠燈時發現 2 個情境 step 寫錯，等使用者決定）

## 1. 對應的 F 與完成條件

| 項目 | 狀態 |
| --- | --- |
| F3 建立影片與選模型：選寺廟後選圖片與影片模型，帶入系列預設 | 實作完成；「模型鎖定」在第 5 階段（產生定裝版時寫入） |
| F4 照片上傳與去識別：1～5 張、瀏覽器端偵測與遮蔽、手動增減、神像可取消 | 實作完成 |
| F1 補充：修改系列只影響之後新增的影片（第 2 階段稽核） | 完成 |
| 06：建立影片頁的步驟列、選寺廟、選模型（顯示模型能力表） | 完成 |
| 06：MediaPipe 人臉偵測、遮蔽框編輯（新增、刪除、取消）、手動車牌遮蔽 | 完成（真實照片待你驗證） |
| 06：原圖與去識別圖分開存；`assets.cloud_ok` 規則 | 完成 |
| 06：視角對照先以手動指定 | 完成 |
| 06 完成條件：原圖 `cloud_ok = 0`，任何送雲端的函式在型別與執行期都拒絕它 | 完成（`requireCloudOk`、`CloudOkAsset`、`createCloudAssetSender`、資料庫 CHECK） |
| 06 完成條件：遮蔽框可新增、取消 | 實作完成；2 個情境因 step 寫錯而失敗（見第 5 節） |

## 2. 情境與測試

| 類別 | 檔案 | 數量 | 紅燈時 | 綠燈時 |
| --- | --- | --- | --- | --- |
| 情境 | `create-video.feature` | 23（含場景大綱 9 例） | 23 失敗 | 20 通過、3 失敗（step 寫錯） |
| 情境 | `photo-deid.feature` | 30（含場景大綱 11 例） | 30 失敗 | 28 通過、2 失敗（step 寫錯） |
| 情境 | `series-followups.feature` | 2 | 2 失敗 | 2 通過 |
| 整合 | `routes/videos.test.ts`、`routes/photos.test.ts` | 42（17＋25） | 全部失敗（404） | 全部通過 |
| 單元 | server `assets/*.test.ts` | 17 | 16 失敗、1 通過（資料庫 CHECK） | 全部通過 |
| 單元 | shared、comfy-client | 25 | 24 失敗、1 通過（型別測試） | 全部通過 |
| 單元 | web `features/deid`、`photos`、`videos` | 39 | 全部失敗 | 全部通過 |
| 單元 | `BottomActionBar.test.tsx` 新增 1 個 | 1 | 通過（補既有行為，第 2 階段稽核要求） | 通過 |

- 紅燈：新測試 121 個單元／整合失敗，55 個情境失敗，原因都是「尚未實作」（空函式丟出例外、路由 404、找不到元素）。
- 紅燈時就通過的 3 個測試：
  - 型別測試：由 `pnpm typecheck` 實際檢查。
  - 資料庫 CHECK：屬於 migration。
  - 「沒有說明時不顯示說明區」：補的是既有行為。
- 目前：
  - `pnpm test` 314 通過；`pnpm typecheck`、`pnpm lint` 通過。
  - `pnpm test:e2e` 81 通過、5 失敗。
- `verify-tests-untouched.mjs 637e623` 通過。
- 提交：`637e623` test；實作尚未 commit（停止中）。

## 3. 新增的套件與自己取的名稱

| 套件 | 版本 | 理由 |
| --- | --- | --- |
| @mediapipe/tasks-vision | 1.1.1 | 02 指定的瀏覽器端人臉偵測。最新的 1.2.0 發布不到一週，所以選兩週以上的版本 |

其他新增的檔案與設定：

- 模型檔 `apps/web/public/models/blaze_face_short_range.tflite`（Google 官方，Apache-2.0，sha256 `b4578f35…0152f`），從本機載入。
- 新套件 `packages/comfy-client`：目前只有送往雲端的唯一入口 `createCloudAssetSender`。傳送格式是 07 的待測事項，所以只定義介面。
- ESLint 不檢查 `prompt-studio/`：它是 CommonJS、Node 18，有自己的 `node --test`；ab0a755 起 `pnpm lint` 就因為它失敗。

文件沒寫、自己取的名稱：

- API：
  - `POST /api/videos/:id/photos/originals`：原圖的端點。
  - `PATCH /api/videos/:id/photos/:photoId`：改視角、重新遮蔽。
  - `GET /api/assets/:id`：讀本機檔案。
- 網址 `?video=<id>`：建立影片頁記住草稿。
- 遮蔽框格式 `deid_boxes`：`{ id, kind: face|plate, source: auto|manual, x, y, width, height, cancelled }`，位置用 0～1 的比例。
- 檔案資料夾：`data/assets/originals/`、`data/assets/deid/`。
- 介面名稱：
  - 框的名稱「臉孔 N／遮蔽框 N／車牌 N」。
  - 按鈕「調整遮蔽」「儲存遮蔽」「不儲存，關閉」「重新選擇寺廟」。
- 決定：
  - `videos`、`photos` 不對 `temples` 設外鍵，因為 `pnpm db:import` 會整批重建寺廟資料。
  - 去識別圖一律輸出 JPEG（品質 0.92），用實心灰色遮蔽，不用馬賽克。
  - 偵測門檻 0.3，寧可多遮。

## 4. 對齊檢查

1. **對應的 feature**：F3（選寺廟、選模型；鎖定在第 5 階段）、F4（上傳與去識別），另補 F1 一個驗收條件。
2. **有沒有做到「這一版不做的東西」**：沒有。
3. **名稱是否一致**：
   - 一致的部分：資料表 `videos`、`photos`、`assets` 依 05；路由 `/series/:sid/videos/new` 依 03；按鈕名稱「AI 整理成條列」「產生寺廟定裝版」依 03；元件依 04。
   - 05 沒列的端點：見第 3 節。
4. **金鑰或原圖有沒有可能被送出**：
   - 這階段沒有任何雲端呼叫。
   - 原圖在資料庫的 `cloud_ok` 永遠為 0，有 CHECK 限制擋著。
   - `getCloudOkAsset` 與 `createCloudAssetSender` 在型別與執行期都拒絕原圖。
   - 原圖只經由本機後端存取，回應帶 `Cache-Control: no-store`。
5. **付費生成能不能不經同意就觸發**：不能，這階段沒有付費生成。「產生寺廟定裝版」不能按。

## 5. 等你處理

- **停止原因**：2 個 step 寫錯（`.feature` 沒問題），需要你同意回到紅燈修正：
  1. `寺廟資料卡的「X」是「Y」` 用了 `getByRole('definition', { name })`。Playwright 禁止 `definition` 有名稱，所以永遠找不到（已用獨立腳本驗證）。影響 3 個場景。
  2. `去識別後的照片在「X」的位置被遮蔽` 在 `expect.poll` 裡找不到框就丟錯，而 `expect.poll` 遇到錯誤不會重試，變成和「儲存遮蔽」的競態。影響 2 個場景。
- 用真實照片確認人臉偵測（第 5 階段前）。
- 01「待決定」三項的暫定做法（視角清單、圖片模型、車牌與人物），見 PROGRESS。
- 「讓 AI 推測」「產生寺廟定裝版」留到第 5 階段。

## 6. 稽核結果

（停止中，尚未稽核）
