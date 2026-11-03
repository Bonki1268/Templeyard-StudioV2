import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ReferenceSlot } from '@templeyard/shared';
import { findAsset, getCloudOkAsset, insertAsset } from '../assets/repository.js';
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
  const cols = count <= 1 ? 1 : count <= 4 ? 2 : 3;
  const rows = Math.max(1, Math.ceil(count / cols));
  return { cols, rows, cellWidth: 640, cellHeight: 360 };
}

/** 拼接圖的說明：「參考圖拼成一張（由左到右、由上到下）：第 1 格是 …；第 2 格是 …」 */
export function sheetLabel(labels: readonly string[]): string {
  const cells = labels.map((label, index) => `第 ${index + 1} 格是${label}`).join('；');
  return `參考圖拼成一張（由左到右、由上到下）：${cells}。畫成一個場景，不要照拼接的樣子畫`;
}

/**
 * 依模型的參考圖設定決定要送哪幾張：
 * - 不超過 max：照原樣
 * - 超過 max、有 sheet：前 sheet.max 張拼成一張
 * - 超過 max、沒有 sheet：只送前 max 張
 */
export async function fitReferences(refs: readonly ReferenceInput[], slot: ReferenceSlot, sheets: ReferenceSheets | null): Promise<ReferenceInput[]> {
  if (refs.length <= slot.max) return [...refs];
  if (!slot.sheet) return refs.slice(0, slot.max);
  if (!sheets) throw new Error('參考圖要拼成一張，但沒有設定 FFmpeg');
  return [await sheets.compose(refs.slice(0, slot.sheet.max))];
}

export function createReferenceSheets(deps: { db: AppDatabase; clock: Clock; store: AssetStore; ffmpeg: Ffmpeg }): ReferenceSheets {
  return {
    async compose(refs) {
      // 只拼可以上雲的圖：原圖在這裡就會被擋下
      const files = refs.map((ref) => {
        const asset = getCloudOkAsset(deps.db, ref.assetId);
        const found = findAsset(deps.db, asset.id);
        if (!found) throw new Error(`找不到參考圖：${ref.assetId}`);
        return deps.store.pathOf(found.path);
      });
      const layout = sheetLayout(files.length);
      const dir = mkdtempSync(path.join(tmpdir(), 'templeyard-sheet-'));
      try {
        const output = path.join(dir, 'sheet.png');
        await deps.ffmpeg.sheet({ files, ...layout, output });
        const id = deps.clock.newId();
        const bytes = readFileSync(output);
        const saved = deps.store.save({ id, kind: 'frame', mime: 'image/png', bytes });
        insertAsset(deps.db, {
          id,
          kind: 'frame',
          mime: 'image/png',
          path: saved.path,
          sha256: saved.sha256,
          width: layout.cols * layout.cellWidth,
          height: layout.rows * layout.cellHeight,
        });
        return { label: sheetLabel(refs.map((ref) => ref.label)), assetId: id };
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}
