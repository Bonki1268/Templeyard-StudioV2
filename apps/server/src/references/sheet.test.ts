import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ReferenceSlot } from '@templeyard/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findAsset, insertAsset } from '../assets/repository.js';
import { createAssetStore, type AssetStore } from '../assets/store.js';
import { createFfmpeg } from '../compose/ffmpeg.js';
import { openDatabase, type AppDatabase } from '../db/client.js';
import { createReferenceSheets, fitReferences, sheetLabel, sheetLayout, type ReferenceInput, type ReferenceSheets } from './sheet.js';

// 07 實測（2026-11-03）：Nano Banana Pro 一次只收一張參考圖，多張先拼成一張

describe('拼接的版面', () => {
  it.each([
    [1, 1, 1],
    [2, 2, 1],
    [3, 2, 2],
    [4, 2, 2],
    [5, 3, 2],
    [6, 3, 2],
    [9, 3, 3],
  ])('%i 張：%i 欄 %i 列，每格 640×360', (count, cols, rows) => {
    expect(sheetLayout(count)).toEqual({ cols, rows, cellWidth: 640, cellHeight: 360 });
  });
});

describe('拼接圖的說明', () => {
  it('依由左到右、由上到下的順序說明每一格', () => {
    expect(sheetLabel(['角色「阿嬤」定裝圖', '定裝版視角圖「廟前全景」'])).toBe(
      '參考圖拼成一張（由左到右、由上到下）：第 1 格是角色「阿嬤」定裝圖；第 2 格是定裝版視角圖「廟前全景」。畫成一個場景，不要照拼接的樣子畫',
    );
  });
});

describe('要送哪幾張參考圖', () => {
  const refs: ReferenceInput[] = [
    { label: 'A', assetId: 'a' },
    { label: 'B', assetId: 'b' },
    { label: 'C', assetId: 'c' },
  ];
  const composed: ReferenceInput[][] = [];
  const sheets: ReferenceSheets = {
    compose: async (input) => {
      composed.push([...input]);
      return { label: 'sheet', assetId: 'sheet-1' };
    },
  };
  const slot = (overrides: Partial<ReferenceSlot> = {}): ReferenceSlot => ({ paths: [['medias']], max: 1, ...overrides });

  beforeEach(() => {
    composed.length = 0;
  });

  it('不超過模型一次收的張數：照原樣', async () => {
    expect(await fitReferences(refs, slot({ max: 3 }), sheets)).toEqual(refs);
    expect(composed).toEqual([]);
  });

  it('超過、有拼接設定：前 sheet.max 張拼成一張', async () => {
    expect(await fitReferences(refs, slot({ sheet: { max: 2 } }), sheets)).toEqual([{ label: 'sheet', assetId: 'sheet-1' }]);
    expect(composed).toEqual([refs.slice(0, 2)]);
  });

  it('超過、沒有拼接設定：只送前 max 張', async () => {
    expect(await fitReferences(refs, slot({ max: 2 }), sheets)).toEqual(refs.slice(0, 2));
  });

  it('要拼接但沒有拼接服務：丟出錯誤，不偷偷少送', async () => {
    await expect(fitReferences(refs, slot({ sheet: { max: 4 } }), null)).rejects.toThrow('參考圖要拼成一張，但沒有設定 FFmpeg');
  });

  it('沒有參考圖：空的', async () => {
    expect(await fitReferences([], slot({ sheet: { max: 4 } }), sheets)).toEqual([]);
  });
});

describe('用本機 FFmpeg 拼接', () => {
  let dir: string;
  let db: AppDatabase;
  let store: AssetStore;
  let id = 0;
  const clock = { now: () => new Date('2026-11-03T09:00:00.000Z'), newId: () => `id-${++id}` };

  function addImage(assetId: string, color: string) {
    const file = path.join(dir, `${assetId}.png`);
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:size=320x240`, '-frames:v', '1', file]);
    const saved = store.save({ id: assetId, kind: 'view', mime: 'image/png', bytes: readFileSync(file) });
    insertAsset(db, { id: assetId, kind: 'view', mime: 'image/png', path: saved.path, sha256: saved.sha256 });
  }

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'sheet-test-'));
    db = openDatabase(':memory:');
    store = createAssetStore(path.join(dir, 'assets'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('3 張拼成一張 1280×720 的 PNG，存成可以上雲的資產，說明每一格是什麼', async () => {
    addImage('red', 'red');
    addImage('green', 'green');
    addImage('blue', 'blue');
    const sheets = createReferenceSheets({ db, clock, store, ffmpeg: createFfmpeg() });

    const sheet = await sheets.compose([
      { label: '紅', assetId: 'red' },
      { label: '綠', assetId: 'green' },
      { label: '藍', assetId: 'blue' },
    ]);

    expect(sheet.label).toBe(sheetLabel(['紅', '綠', '藍']));
    const asset = findAsset(db, sheet.assetId);
    expect(asset).toMatchObject({ mime: 'image/png', cloudOk: true, width: 1280, height: 720 });
    const info = await createFfmpeg().probe(store.pathOf(asset?.path ?? ''));
    expect(info).toMatchObject({ width: 1280, height: 720 });
    // 左上是紅色、右上是綠色（第 1、2 格）
    const pixels = await createFfmpeg().grayFrame(store.pathOf(asset?.path ?? ''), null, { width: 2, height: 2 });
    expect(pixels[0]).not.toBe(pixels[1]);
  });

  it('不能把原圖拼進去：資產不是可以上雲的就丟出錯誤', async () => {
    const file = path.join(dir, 'orig.png');
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=white:size=320x240', '-frames:v', '1', file]);
    const saved = store.save({ id: 'orig', kind: 'original_photo', mime: 'image/png', bytes: readFileSync(file) });
    insertAsset(db, { id: 'orig', kind: 'original_photo', mime: 'image/png', path: saved.path, sha256: saved.sha256 });
    addImage('ok', 'red');
    const sheets = createReferenceSheets({ db, clock, store, ffmpeg: createFfmpeg() });
    await expect(sheets.compose([{ label: '原圖', assetId: 'orig' }, { label: '可以', assetId: 'ok' }])).rejects.toThrow();
  });
});
