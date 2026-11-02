# language: zh-TW
@mode:default
功能: 生成指令管理的擴充：呼叫綁定、模型寫法、連續性鎖預覽（F20）
  為了讓每個生成節點的資料寫進 MCP 呼叫的正確位置，並看得到連續性鎖怎麼帶入
  身為維運的人
  我想在 Prompt Studio 編輯呼叫綁定與模型寫法，儲存時擋下對不上的設定

  場景大綱: 圖片與影片節點都有呼叫綁定，最終指令寫進 MCP 的 prompt
    當 我透過 Prompt Studio 讀取「<節點>」
    那麼 呼叫綁定把「prompt」對應到「output.prompt」
    而且 呼叫綁定把「aspectRatio」對應到「target.aspectRatio」

    例子:
      | 節點             |
      | temple-view      |
      | character-sheet  |
      | character-look   |
      | storyboard-image |
      | refined-frame    |
      | keyframe         |
      | region-edit      |
      | shot-video       |

  場景: 影片節點另外把秒數綁到這一格的秒數
    當 我透過 Prompt Studio 讀取「shot-video」
    那麼 呼叫綁定把「durationSec」對應到「shot.durationSec」

  場景大綱: 呼叫綁定對不上時拒絕儲存
    當 我透過 Prompt Studio 儲存「<節點>」，但<情況>
    那麼 Prompt Studio 回應 422，說明包含「<說明>」

    例子:
      | 節點        | 情況                               | 說明                                                   |
      | temple-view | 綁定到工作流程裡不存在的位置       | 呼叫綁定 frameCount 不是工作流程的位置                  |
      | temple-view | 綁定的資料沒有宣告                 | 呼叫綁定 prompt 用到 shot.unknown，但變數清單沒有宣告  |
      | temple-view | 圖片節點綁定了秒數                 | 呼叫綁定 durationSec：Nano Banana Pro 的工作流程沒有這個位置 |
      | copy-polish | 文字節點有呼叫綁定                 | 文字節點直接送 Claude，不能有呼叫綁定                  |

  場景: 在管理頁看到並修改呼叫綁定
    假設 我打開 Prompt Studio 的「寺廟定裝版：視角圖」
    那麼 呼叫綁定「prompt」的欄位是「output.prompt」
    當 我把呼叫綁定「prompt」改成「instruction」
    而且 我在 Prompt Studio 按下「儲存」
    那麼 Prompt Studio 顯示「已儲存」
    當 我重新整理頁面
    那麼 呼叫綁定「prompt」的欄位是「instruction」

  場景: 在管理頁修改某個模型的寫法
    假設 我打開 Prompt Studio 的「分鏡影片」
    當 我把「Seedance 2.0」的模型寫法改成「Seedance 寫法：測試用」
    而且 我在 Prompt Studio 按下「儲存」
    那麼 Prompt Studio 顯示「已儲存」
    而且 透過 Prompt Studio 讀取「shot-video」時，「seedance-2.0」的模型寫法是「Seedance 寫法：測試用」

  場景: 組裝預覽列出逐字帶入的連續性鎖
    假設 我打開 Prompt Studio 的「寺廟定裝版：視角圖」
    當 我在 Prompt Studio 按下「組裝預覽」
    那麼 預覽的「連續性鎖」列出「red swallowtail roof ridge with cut-porcelain dragons」
    而且 預覽的「連續性鎖」列出「grey granite dragon columns」

  場景: 原有的儲存驗證仍然有效：用到未宣告的變數時拒絕儲存
    當 我透過 Prompt Studio 儲存「character-sheet」，但指令用到未宣告的變數
    那麼 Prompt Studio 回應 422，說明包含「指令用到 {{unknown.var}}，但變數清單沒有宣告」
