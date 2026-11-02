> 來源：zenstory-ai/drama-skills v0.10.0 `skills/short-drama-storyboard/references/keyframe-craft.md`（MIT 授權，見根目錄 LICENSE）。本檔由簡體自動轉為繁體，內容未改寫。

# Frozen Keyframe Craft

## 目錄

- [Boundary and instant tests](#boundary-and-instant-tests)
- [Purpose](#purpose)
- [Ordered recipe](#ordered-recipe)
- [尾幀：什麼時候可以有，以及它換來什麼代價](#尾幀什麼時候可以有以及它換來什麼代價sht-17)
- [Start-only drafting discipline](#start-only-drafting-discipline)
- [Static test](#static-test)

## Boundary and instant tests

- `SHT-05` — Project exactly one accepted shot boundary and bind the exact
  Character/Look, Location/View, and Prop/State variants visible there.
- `SHT-06` — Describe one freezeable instant. Ordered action, expression arcs,
  camera movement, and transforming weather belong to motion, not the keyframe.

## Purpose

Describe one frame that can exist at a single instant and accurately anchors the
accepted shot. A keyframe is not a compressed video prompt.

## Ordered recipe

1. **Purpose:** what the audience must notice now.
2. **Focal subject:** exact asset and variant IDs.
3. **Frame:** shot size, angle, lens intent, aspect-aware composition.
4. **Geography:** Location/View, fixed anchors, foreground/background zones.
5. **Boundary projection:** exact start position, body facing, pose, gaze, hands,
   held props. Give body facing for every person — it fixes which screen side they
   hold and which side the next reverse cuts from; `gaze` does not cover it. Add
   head facing only when it differs from body facing.
6. **Performance instant:** one visible expression/tension state, not an arc.
   Pick a channel the current shot size can actually read — gaze, breath, body
   set, object handling, or a held decision. A wide shot cannot carry an eyelid;
   a close-up cannot carry a full-body retreat. Naming only the emotion ("憤怒")
   leaves the translation to a downstream stage, and the keyframe is the first
   frame — a mistranslation there is wrong from frame one.
7. **Light and atmosphere:** inherit accepted direction/time/weather; add only
   frame-relevant detail.
8. **Text policy:** readable/symbolic/blank/postproduction for visible surfaces.
9. **Exclusions:** contradictions or drift likely for this frame.

Identity and boundary facts remain source references. The keyframe owns focal,
composition, camera/lens, frame-only staging, and exclusions.

### 寫完之後過一遍可渲染檢查

檢查接手的人能否讀出當前幀必須保持的可見事實。按構圖和鏡頭職責核對下表，
只補本幀實際需要的內容：

| 檢查內容 | 資訊缺失時的風險 |
|---|---|
| 每個人在哪、彼此距離多少（"站在他正前方約兩步"） | 人物間距逐鏡漂移，觀眾讀成換了場地 |
| 構圖需要縱深時，前景、中景、背景分別承載什麼 | 層次不明，主體與背景混在一起 |
| 視線該落在哪（本鏡的視覺重點） | 畫面平均用力，觀眾不知道該看誰 |
| 構圖方式與景別 | 同一場每鏡構圖隨機，剪不到一起 |
| 機位在軸線哪一側、俯仰角度、焦段意圖 | 越軸；正反打方向對不上 |
| 光從哪來、什麼質感 | 同場光位逐鏡跳變 |
| 每個在場者的姿態、朝向、手部、持物 | 下一鏡接不住，道具憑空易手 |
| 與上一鏡連續的關鍵狀態在本幀具體是什麼 | 只寫“同上”，當前正文無法獨立說明狀態 |

連續性核對時可以與上一鏡比較；可複製正文仍須寫出當前幀的位置、持物和其他必要狀態，
不能用“與上一鏡相同”代替執行端本次需要的事實。

**`craft_default`：一件事只說一次。** 合併能自然銜接的句子，刪除重複事實和不幫助確定畫面的鋪墊。
不設通用字數門檻；保留當前幀所需的身份、空間、構圖、光線、文字和連續性事實。

以下合成片段示意構圖與靜態事實的組織方式：

```text
豎屏 9:16 中近景。機位在軸線左側、高約一米二，平視略低約五度，中焦 50mm。前景是長凳
扶手與半張溼報紙（佔下緣約六分之一）；中景是兩人對峙；背景是虛焦的候車牌。三分構圖，
她落在右三分線上。她：坐長凳右端，雙手交疊壓膝，身體朝向正前，視線落在對方鞋尖，
無持物。人物乙：站她正前方約兩步、略偏畫面左，雙手插袋，身體朝向她，頭略偏向出口。
光自畫面右上頂棚縫隙斜下為主光（硬），左側留暗，無補光。視覺重點在她壓膝的雙手。
排除：無動作過程，無雨絲拖影。
```

Every visible entry the finished frame carries is listed in the shot's required
`視覺依據` field, resolving to a real `視覺設定.md` entry; an `IMG-...` prompt item
in `圖片提示詞.md` is a separate axis and does not stand in for it, and
`視覺設定.md` itself does not define `IMG-...` IDs. Write that list from the
finished frame, not from the shot's intent — the subject that gets missed is the
one that entered the composition while the frame was being written. A frozen frame may determine whether the surface
is legible in this composition; it may not replace the exact wording or policy
with an untraceable prose instruction. If the policy is still undecided, say so
instead of inventing a hidden candidate state.

## 尾幀：什麼時候可以有，以及它換來什麼代價（`SHT-17`）

預設每鏡一張首幀，凍結「起點」。交付工作流需要首尾幀時，再補一張投影
「終點」的尾幀；兩幀之間的運動仍按分鏡邊界和運動提示詞實現。

**`structural_invariant`**：《分鏡.md》的首幀與收尾關鍵幀分別指向同一鏡頭已接受的起點與終點。
**尾幀是「終點」的投影，
不是新的終點事實**——它與首幀對「起點」的關係完全一樣：可以決定這一幀怎麼構圖、
用什麼景別鏡頭、光怎麼落，不能決定人在哪、手裡有什麼、看著誰。尾幀與鏡頭終點不一致時，
錯的是尾幀。

每鏡的關鍵幀數量**不是固定的**。預設一張首幀；只有當交付工作流真的要消費尾幀時才加一張，
不為湊齊而畫。補尾幀不改變 `SHT-10`：首幀仍然只能寫 start 事實，尾幀只能寫 end 事實，
兩張各自守自己的邊界，不互相借用。

**代價要說清楚：交出一對首尾幀，等於把兩幀之間的運動交給了執行端插值**。 而運動路徑本來
是運動規格擁有的東西。所以選了首尾幀接續的鏡頭，其運動規格不是"照舊再寫一遍"，而是被
兩端夾住了：它仍然要寫清中間必須發生什麼（動作順序、對白落點、攝影機行為），但要意識到
執行端會優先滿足兩端的畫面一致性。因此——

- 中間必須被看到的動作**不要只靠插值兌現**。如果一個動作是本鏡存在的理由，兩端之間沒有
  任何東西保證它會發生，就該拆鏡，或者讓該動作落在其中一端。
- 兩端差異越大，插值越自由，中間越不可控。首尾幀接續適合"狀態改變清楚、路徑無所謂"的
  鏡頭（轉身、遞交完成、坐下），不適合"路徑本身是戲"的鏡頭。
- 終點報告仍然對照鏡頭「終點」，不對照尾幀。尾幀只是它的投影，不能自證到達。

## Start-only drafting discipline

**`SHT-10 · reviewed_invariant`**: rendered keyframe prose may contain only facts
from the boundary that frame declares. 首幀寫進任何由運動或終點首次產生的事實是漂移；
尾幀寫進在它之前就已經消耗掉的事實同樣是漂移。兩幀各守各的邊界，不互相借用。

關鍵幀預設投影鏡頭起點，不能直接選取“本鏡最有戲的時刻”。為避擴音前寫入終點事實：

1. 先明確本幀凍結 `SHOT-...` 的起點，草擬正文時暫不讀終點與運動描述；
2. 只填起點已成立的位置、姿態、目光、雙手、持物和可見狀態；
3. 再對照終點，找出動作後才產生的事實，確保它們未進入起始關鍵幀正文；
4. 寫完 Markdown 後從自然語言反向提取手位、持物、目光和可見狀態，與鏡頭起點再比一次；
   不能只看條目說明而忽略真正交付的正文。

反例：start 是“右手空置、看對方”，end 是“右手握鈴繩、看門”。凍結幀寫
“手已握鈴繩”會提前寫入終點事實，屬於邊界漂移。

## Static test

Ask: could a still photographer capture every described fact at once?

Move these to motion:

- ordered verbs (先、再、隨後、最終);
- expression changing from A to B;
- camera push/pan/track over time;
- entering/leaving/turning/reaching sequences;
- dialogue delivery arc or sound progression;
- light/weather transforming during the shot.

A single held pose may imply tension, but it must not require several moments.

## Prompt economy

Do not restate full character or location 設定集s. Bind accepted variants and
repeat only facts the frame needs to prevent ambiguity: distinguishing anchor,
current Look, crucial spatial anchor, held prop, light direction, text state.

Generic “cinematic, 8K, masterpiece” language cannot replace subject identity,
geography, composition, or continuity.

## Failure examples

- incompatible Looks appear in the same frame;
- “turns, runs, then looks back” appears in a still;
- the start hand/prop differs from the shot boundary;
- background changes location identity or orientation;
- light direction resets without source change;
- readable evidence is paired with no-text;
- prompt lists subjects but not their spatial relationship;
- framing has no focal hierarchy.
- structured projection matches start but rendered prompt describes a fact that
  first appears in the shot end or motion.
