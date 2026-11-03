import type { PlanCheck, Shot, ShotInput } from '@templeyard/shared';

// 方案面板的編輯：卡片的增刪、複製、排序、秒數；每次修改送出整份卡片，後端新增一個版本

/** 方案的卡片轉成送出用的資料（保留 shotKey，去掉後端計算的欄位） */
export function toInputs(_shots: readonly Shot[]): ShotInput[] {
  throw new Error('尚未實作');
}

/** 把第 from 格移到第 to 格的位置（從 0 起算）；超出範圍不改動 */
export function moveShot(_shots: readonly ShotInput[], _from: number, _to: number): ShotInput[] {
  throw new Error('尚未實作');
}

/** 複製第 index 格，放在它後面；複製出來的是新的一格（沒有 shotKey） */
export function duplicateShot(_shots: readonly ShotInput[], _index: number): ShotInput[] {
  throw new Error('尚未實作');
}

/** 刪除第 index 格；只剩一格時不刪 */
export function removeShot(_shots: readonly ShotInput[], _index: number): ShotInput[] {
  throw new Error('尚未實作');
}

/** 在最後新增一格：3 秒、中景、固定，其他留白 */
export function addShot(_shots: readonly ShotInput[]): ShotInput[] {
  throw new Error('尚未實作');
}

/** 換掉每一格的秒數（時間軸拖曳後） */
export function withDurations(_shots: readonly ShotInput[], _durations: readonly number[]): ShotInput[] {
  throw new Error('尚未實作');
}

/** 「生成」旁列出的原因：秒數檢查沒過的原因，加上精緻圖生成還沒開放 */
export function generateBlockers(_check: PlanCheck): string[] {
  throw new Error('尚未實作');
}
