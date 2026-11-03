import { FRAMES_NOT_OPEN, type PlanCheck, type Shot, type ShotInput } from '@templeyard/shared';

// 方案面板的編輯：卡片的增刪、複製、排序、秒數；每次修改送出整份卡片，後端新增一個版本

/** 方案的卡片轉成送出用的資料（保留 shotKey，去掉後端計算的欄位） */
export function toInputs(shots: readonly Shot[]): ShotInput[] {
  return shots.map(({ seq: _seq, startSec: _start, dialogueEstimateSec: _estimate, ...rest }) => rest);
}

/** 把第 from 格移到第 to 格的位置（從 0 起算）；超出範圍不改動 */
export function moveShot(shots: readonly ShotInput[], from: number, to: number): ShotInput[] {
  const next = [...shots];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) return next;
  const [moved] = next.splice(from, 1);
  if (moved) next.splice(to, 0, moved);
  return next;
}

/** 複製第 index 格，放在它後面；複製出來的是新的一格（沒有 shotKey） */
export function duplicateShot(shots: readonly ShotInput[], index: number): ShotInput[] {
  const source = shots[index];
  if (!source) return [...shots];
  const { shotKey: _key, ...copy } = source;
  return [...shots.slice(0, index + 1), copy, ...shots.slice(index + 1)];
}

/** 刪除第 index 格；只剩一格時不刪 */
export function removeShot(shots: readonly ShotInput[], index: number): ShotInput[] {
  if (shots.length <= 1) return [...shots];
  return shots.filter((_, i) => i !== index);
}

/** 在最後新增一格：3 秒、中景、固定，其他留白 */
export function addShot(shots: readonly ShotInput[]): ShotInput[] {
  return [...shots, { durationSec: 3, shotSize: '中景', cameraMove: '固定', description: '', viewKey: '', dialogue: '', subtitle: '' }];
}

/** 換掉每一格的秒數（時間軸拖曳後） */
export function withDurations(shots: readonly ShotInput[], durations: readonly number[]): ShotInput[] {
  return shots.map((shot, index) => ({ ...shot, durationSec: durations[index] ?? shot.durationSec }));
}

/** 「生成」旁列出的原因：秒數檢查沒過的原因，加上精緻圖生成還沒開放 */
export function generateBlockers(check: PlanCheck): string[] {
  return [...check.blocking, FRAMES_NOT_OPEN];
}
