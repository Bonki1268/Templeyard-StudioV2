> 來源：zenstory-ai/drama-skills v0.10.0 `skills/short-drama-image-prompts/references/look-and-state-variant.md`（MIT 授權，見根目錄 LICENSE）。本檔由簡體自動轉為繁體，內容未改寫。

# Look、View 與道具狀態變體提示詞

## 目錄

1. 什麼時候需要變體
2. Base—delta—validity
3. 三類變體的寫法
4. 變體 plate 與 edit 的區別
5. 輸出、失敗與審查

## 1. 什麼時候需要變體

變體用於明確有因果、可複用、在一定範圍內持續的視覺狀態，同時保留持久身份；瞬時表情或手勢通常留在鏡頭中。

先用 `視覺設定.md` 的當前判斷區分：

- **reuse**：身份/地理/功能和需要保持的 state 都沒變，直接複用；
- **variant**：同一身份上出現可逆或時間有界的 Look/View/道具狀態差異；
- **new asset**：持久身份、固定地理或基本功能已改變；
- **unresolved**：無法確定，停止寫提示詞並讓創作者選擇。

身份歸類由資產負責技能決定，圖片提示詞只呈現已確認變體。

## 2. Base—delta—validity

一個 `IMG-...` 變體條目必須能回答：

1. **Base**：它從哪個準確身份/變體 ID 派生？
2. **Preserved anchors**：哪些 Character/Location/Prop 身份事實不變？
3. **Delta**：哪裡發生了什麼可觀察變化，範圍和強度如何？
4. **Cause/source**：變化來自哪個場景、連續性事實或創作者決定？
5. **Validity**：從哪裡開始、持續到哪裡、何時恢復/再變化？
6. **Affected work**：哪些 `IMG-...`、`SHOT-...` 或關鍵幀需要此變體？

- **`structural_invariant`**：基底、變體 ID、來源與有效範圍可解析；不得同時使用不相容變體。
- **`reviewed_invariant`**：delta 與持久錨點沒有混層，也沒有超過 source 支援的範圍。
- **`craft_default`**：正文先短述保持的身份，再把注意力放在 delta；不要重寫全部 base。
- **`taste_option`**：單獨 variant plate、同版對照或區域性細節板由複用目的決定；預設單獨 plate 更少歧義。

## 3. 三類變體的寫法

### Character / Look

常見 delta：衣服/穿法、髮型整理、妝面、臨時配飾、汙溼、血跡、新傷、包紮、年齡化階段。寫清身體/衣物位置、覆蓋範圍、材料反應和未變區域。

示例機制（合成）：同一維修員夜班 Look 經雨後，只有外套右肩至肘部明顯溼深，頭髮末端微溼；臉型、斷眉、服裝剪裁、左胸布貼和右袖舊焊痕保持。不要把“雨後”擴成新傷、換裝或全身滴水。

瞬時目光、一次抬手、單鏡頭表情通常屬於 shot/keyframe，不建 Look。

### Location / View-state

常見 delta：特定觀察方向、臨時 dressing、營業/停業狀態、時間、天氣和光線。固定入口、主要分割槽、建築結構及關鍵錨點保持；寫清從 base View 哪些可見條件改變。

夜景不是把門窗重新佈局。臨時堆放物不要升級為固定地理。若洪水、坍塌等永久改變動線，應由 assets 判斷是否仍是 variant。

### 道具狀態（Prop/State）

常見 delta：開/關、內容物、損壞、汙漬、文字、持有者與功能狀態。寫清鉸鏈/缺口/裂紋位置、內容可見程度、承載面文字政策和未變輪廓材料。

換手不一定需要新的 plate；只有下游識別/連續性確需一個持續狀態時才做。道具完全斷成兩件且功能改變，可能需要 owner 決定新 State 或新 asset，prompt 不代判。

## 4. 變體 plate 與 edit 的區別

- **Variant plate** 描述一個已確認、可被多個鏡頭複用的完整當前狀態；它可以從零編寫提示詞，不以某張待編輯圖片為前提。
- **Edit-delta** 指向準確的 `IMG-...` 提示詞條目及具體物件和區域，說明變化、保持項與連續性影響；
  實際待編輯圖片另作參考繫結，不能把條目 ID 當作圖片。

若創作者說“把袖子改溼”：

1. 已有明確的溼衣 Look，且目標是複用狀態 → 可以寫變體板或區域性編輯；
2. 溼衣 Look 尚未確認 → 先向 assets 提變體選擇；
3. 只發生在單鏡頭動作末端、沒有持續複用 → 先交分鏡處理連續性，不自動建立資產提示詞。

不要把 before/after 兩個互斥人物疊在一張身份板，除非用途明確是比較板，且兩個區域/標籤不會造成身份融合；這屬於可覆蓋的 craft choice，不是預設。

## 5. 輸出、失敗與審查

### 失敗徵兆

- 只有“更髒、更老、更陰森”，沒有位置、範圍和可觀察 delta；
- delta 覆蓋整個人/地點/物件，實際已改變持久身份卻仍叫 variant；
- prompt 複製 base 全文後，把真正變化藏在末尾；
- 有狀態但無 cause/validity，導致後續鏡頭不知道何時複用；
- 把 pose、機位或一次 reaction 當成資產變體；
- 同一 plate 同時畫完好/損壞、白天/夜晚或兩套 Look，未宣告比較用途。

### 檢查

| 檢查 | 分類 |
|---|---|
| 準確基底/變體、來源、有效範圍解析 | `structural_invariant` |
| delta 是否保持 identity/geography/function | `reviewed_invariant` |
| 是否誤把瞬時 shot 狀態升級為 asset variant | `reviewed_invariant` |
| delta 是否比 base boilerplate 更醒目 | `craft_default` |
| 單圖或對照板、變化強度與呈現媒介 | `taste_option` |

輸出一個寫清基底、變化、保持項、有效範圍和受影響工作的 `IMG-...` 條目，以及一段聚焦當前狀態的
可複製正文。不得生成圖片，也不得聲稱變體畫面已經驗證成功。
