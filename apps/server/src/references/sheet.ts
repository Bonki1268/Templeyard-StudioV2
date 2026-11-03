import type { ReferenceSlot } from '@templeyard/shared';
import type { AssetStore } from '../assets/store.js';
import type { Ffmpeg } from '../compose/ffmpeg.js';
import type { AppDatabase } from '../db/client.js';
import type { Clock } from '../series/repository.js';

// 參考圖拼接（07 實測，2026-11-03）：Nano Banana Pro 用上傳的檔名時一次只收一張參考圖，
// 多張參考圖（角色定裝圖、定裝版視角圖、照片、關鍵畫格）先在本機用 FFmpeg 拼成一張，指令裡說明每一格是什麼。
// 拼接圖只用可以上雲的圖，本身也是可以上雲的資產。

/** 一張參考圖：給模型看的說明與本機資產編號 */
export type ReferenceInput = { label: string; assetId: string };

export type ReferenceSheets = {
  /** 把幾張參考圖拼成一張（由左到右、由上到下），存成新的資產；回傳它與說明每一格的文字 */
  compose(refs: readonly ReferenceInput[]): Promise<ReferenceInput>;
};

/** 拼接的版面：1 張 1×1、2 張 2×1、3～4 張 2×2、5～6 張 3×2、7～9 張 3×3；每格 640×360（16:9） */
export function sheetLayout(count: number): { cols: number; rows: number; cellWidth: number; cellHeight: number } {
  void count;
  throw new Error('尚未實作');
}

/** 拼接圖的說明：「參考圖拼成一張（由左到右、由上到下）：第 1 格 …；第 2 格 …」 */
export function sheetLabel(labels: readonly string[]): string {
  void labels;
  throw new Error('尚未實作');
}

/**
 * 依模型的參考圖設定決定要送哪幾張：
 * - 不超過 max：照原樣
 * - 超過 max、有 sheet：前 sheet.max 張拼成一張
 * - 超過 max、沒有 sheet：只送前 max 張
 */
export async function fitReferences(refs: readonly ReferenceInput[], slot: ReferenceSlot, sheets: ReferenceSheets | null): Promise<ReferenceInput[]> {
  void refs;
  void slot;
  void sheets;
  throw new Error('尚未實作');
}

export function createReferenceSheets(deps: { db: AppDatabase; clock: Clock; store: AssetStore; ffmpeg: Ffmpeg }): ReferenceSheets {
  void deps;
  return {
    compose: async () => {
      throw new Error('尚未實作');
    },
  };
}
