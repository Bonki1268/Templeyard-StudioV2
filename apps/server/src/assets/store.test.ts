import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAssetStore } from './store.js';

let root = '';

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'templeyard-store-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const content = new Uint8Array([1, 2, 3, 4]);

describe('本機檔案存放', () => {
  it('原圖存在 originals/，去識別後的圖存在 deid/，檔名用資產編號', () => {
    const store = createAssetStore(root);

    const original = store.save({ id: 'o1', kind: 'original_photo', mime: 'image/jpeg', bytes: content });
    const deid = store.save({ id: 'd1', kind: 'deid_photo', mime: 'image/png', bytes: content });

    expect(original.path).toBe('originals/o1.jpg');
    expect(deid.path).toBe('deid/d1.png');
    expect(readFileSync(path.join(root, original.path))).toEqual(Buffer.from(content));
  });

  it('回傳 sha256，讀回來的內容相同', () => {
    const store = createAssetStore(root);

    const saved = store.save({ id: 'd2', kind: 'deid_photo', mime: 'image/webp', bytes: content });

    expect(saved.sha256).toBe(createHash('sha256').update(content).digest('hex'));
    expect(store.read(saved.path)).toEqual(Buffer.from(content));
    expect(store.exists(saved.path)).toBe(true);
    expect(store.exists('deid/none.png')).toBe(false);
  });

  it('不能讀取資料夾以外的路徑', () => {
    const store = createAssetStore(root);

    expect(() => store.read('../outside.txt')).toThrow('檔案路徑不在資產資料夾內');
  });
});
