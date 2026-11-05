# 第 14 階段：系列頁（設定、角色庫、過去的影片）

依 `docs/design/series/`、03「系列頁」、06 第 14 階段。

## 1. 對應的 F 與完成條件

F1（系列專案）、F10（角色定裝版，角色詳情）、F7（問卷預設值）、F17（複製影片，過去的影片）。

- [x] 三個分頁與角色詳情都能直接以網址開啟、互相切換（series-tabs.feature）
- [x] 修改問卷預設值後，下一支新影片帶入新值；已建立影片的問卷不變（questionnaire-defaults.feature、questionnaire.test.ts）
- [x] 修改系列視覺風格後，既有影片組出的生成指令仍是建立時保存的風格（characters/service.test.ts「影片保存的系列設定」、series-snapshot.feature）
- [x] 影片篩選、排序與狀態細節文字的單元測試；角色庫篩選與搜尋的單元測試（seriesPages.test.ts、characterLibrary.test.ts）
- [x] 設為系列角色後出現在「系列角色」篩選，並可在同系列新影片沿用（series-characters-tab.feature）
- [x] 角色詳情切換版本時三視圖、定裝圖與「用到的影片」對應正確版本；重生沒有同意憑證時 API 回 409（character-detail.feature）
- [x] 分頁、篩選按鈕、版本切換的無障礙檢查（aria-current、aria-pressed、焦點框、axe）

## 2. 情境與測試

| 項目 | 數量 | 紅燈 | 綠燈 |
| --- | --- | --- | --- |
| 第 14 階段情境（7 個檔案） | 58 | 51 失敗、7 通過（既有的 API 錯誤契約） | 58 通過 |
| 單元測試（新增／修改） | 約 155 | 150 失敗 | 全部通過；`pnpm test` 1434／1434 |
| 全部情境 `pnpm test:e2e` | 402（含舊階段） | — | 402／402（高併發時偶有 1 個舊的等待型情境不穩定） |

綠燈時發現 6 處測試寫錯，經同意回紅燈修正（f27150e、351daab）。

## 3. 新增套件與自取名稱

- 沒有新增套件。
- 自取名稱：`series_snapshot`、`questionnaire_default_edits`、`identity_anchors`／`look`／`change_note`（migration 0012）；設定 `defaultVideoCostLimitCredits`；API `GET/PATCH /api/series/:id/questionnaire-defaults`、`GET /api/characters/:cid/versions|usage`、generate 的 `part`；元件 `SeriesShell`、`SeriesTabsLayout`、`SeriesTabs`、`FilterButtons`、`LeaveGuard`、`useDialog`、`NewCharacterDialog`。
- 實作決定（要改請告訴我）：
  - 角色庫預設範圍是 all；設為系列角色後角色的 `video_id` 清為 null。
  - 已確認的版本重生其中一張，會另存為新版本（另一張沿用）。
  - 寺廟名稱排序依字元順序；影片標題 = 寺廟名稱＋想講的故事（超過 16 字截斷）。
  - 「需重新確認」的角色卡標籤：第 2 版以後還沒確認的版本。
  - 舊資料第一次拆身份錨點與造型，不算「身份錨點有修改」。
  - 角色名稱在詳情頁唯讀（05 沒有改名的 API）。
  - 已刪除舊的 `SeriesSettingsPage`、`SeriesCharacterLibrary`、`SeriesEditForm`（使用者同意）。

## 4. 對齊檢查

1. F1、F7、F10、F17。
2. 沒有做「這一版不做的東西」。
3. 資料表、路由與 03、04、05 一致；多出的欄位與名稱列在第 3 節。
4. 沒有金鑰；角色定裝圖只用文字，不送原圖。
5. 付費生成（重生、另存新版本）都走費用確認與同意憑證；沒有憑證 API 回 409。

## 5. 等你處理

- 實測（要花錢）：用真的 Claude 試角色詳情「造型」與「連續性鎖」的 AI 幫我寫。
- 第 13 階段仍等實測；做完後要再對一次「F1～F22 全部打勾、文件與程式一致」。

## 6. 稽核結果

（由稽核者填寫）
