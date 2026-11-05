import { describe, expect, it } from 'vitest';
import {
  characterScopeCounts,
  composeDescription,
  describeChange,
  filterCharacters,
  libraryStatusLabel,
  parseCharacterScope,
  splitDescription,
  versionButtonLabel,
} from './characterLibrary.js';

const characters = [
  { name: '導覽員阿亮', isSeries: true, version: { description: '二十多歲青年，白色亞麻襯衫，斜背帆布相機背帶' } },
  { name: '廟公阿伯', isSeries: true, version: { description: '六十多歲，花白平頭，戴 Grey Wool Cap' } },
  { name: '小晴', isSeries: false, version: { description: '二十出頭的女生，朱紅刺繡絲質背心' } },
];

describe('角色庫的搜尋與篩選', () => {
  it('依名稱搜尋', () => {
    expect(filterCharacters(characters, { scope: 'all', query: '阿伯' }).map((c) => c.name)).toEqual(['廟公阿伯']);
  });

  it('依外觀描述搜尋', () => {
    expect(filterCharacters(characters, { scope: 'all', query: '刺繡' }).map((c) => c.name)).toEqual(['小晴']);
  });

  it('搜尋不分大小寫，忽略前後空白', () => {
    expect(filterCharacters(characters, { scope: 'all', query: '  grey wool  ' }).map((c) => c.name)).toEqual(['廟公阿伯']);
  });

  it('沒有關鍵字時列出全部', () => {
    expect(filterCharacters(characters, { scope: 'all', query: '' })).toHaveLength(3);
  });

  it('依範圍篩選：系列角色、影片專屬', () => {
    expect(filterCharacters(characters, { scope: 'series', query: '' }).map((c) => c.name)).toEqual(['導覽員阿亮', '廟公阿伯']);
    expect(filterCharacters(characters, { scope: 'video', query: '' }).map((c) => c.name)).toEqual(['小晴']);
  });

  it('搜尋與範圍同時成立才列出', () => {
    expect(filterCharacters(characters, { scope: 'video', query: '阿亮' })).toEqual([]);
  });

  it('各範圍的數量', () => {
    expect(characterScopeCounts(characters)).toEqual({ all: 3, series: 2, video: 1 });
    expect(characterScopeCounts([])).toEqual({ all: 0, series: 0, video: 0 });
  });

  it('查詢參數：沒傳用 all，不在清單回傳 null', () => {
    expect(parseCharacterScope(undefined)).toBe('all');
    expect(parseCharacterScope('video')).toBe('video');
    expect(parseCharacterScope('nobody')).toBeNull();
  });
});

describe('角色卡的狀態標籤', () => {
  it.each([
    ['draft', 1, '待產生定裝圖'],
    ['generating', 1, '生成中'],
    ['pending_confirm', 1, '定裝圖待確認'],
    ['confirmed', 1, '已確認'],
    ['failed', 1, '生成失敗'],
    ['confirmed', 3, '已確認'],
  ] as const)('%s（第 %i 版）：%s', (state, version, label) => {
    expect(libraryStatusLabel({ state, version: { version } })).toBe(label);
  });

  it('第 2 版以後還沒確認：需重新確認', () => {
    expect(libraryStatusLabel({ state: 'pending_confirm', version: { version: 2 } })).toBe('需重新確認');
    expect(libraryStatusLabel({ state: 'draft', version: { version: 2 } })).toBe('需重新確認');
  });
});

describe('外觀描述', () => {
  it('由身份錨點與造型用「；」組成，略過空的、去掉前後空白', () => {
    expect(composeDescription('八十歲、白髮盤髻', '墨綠布衫')).toBe('八十歲、白髮盤髻；墨綠布衫');
    expect(composeDescription('  八十歲 ', '')).toBe('八十歲');
    expect(composeDescription('', ' 墨綠布衫 ')).toBe('墨綠布衫');
    expect(composeDescription('', '')).toBe('');
  });

  it('舊資料沒有身份錨點與造型：整段放在造型', () => {
    expect(splitDescription({ description: '七十歲、短白髮、深藍布衫', identityAnchors: null, look: null })).toEqual({ identityAnchors: '', look: '七十歲、短白髮、深藍布衫' });
  });

  it('有身份錨點或造型時照原樣', () => {
    expect(splitDescription({ description: '甲；乙', identityAnchors: '甲', look: '乙' })).toEqual({ identityAnchors: '甲', look: '乙' });
    expect(splitDescription({ description: '甲', identityAnchors: '甲', look: null })).toEqual({ identityAnchors: '甲', look: '' });
  });
});

describe('版本說明：和上一版的差別', () => {
  const v1 = { version: 1, identityAnchors: '七十歲', look: '深藍布衫', continuityLocks: ['navy blouse'] };

  it('只改造型', () => {
    expect(describeChange(v1, { identityAnchors: '七十歲', look: '灰色外套', continuityLocks: ['navy blouse'] })).toBe('和 v1 的差別：造型有修改');
  });

  it('依序列出身份錨點、造型、連續性鎖', () => {
    expect(describeChange(v1, { identityAnchors: '八十歲', look: '灰色外套', continuityLocks: ['grey coat'] })).toBe('和 v1 的差別：身份錨點、造型、連續性鎖有修改');
  });

  it('連續性鎖的順序不同也算有修改', () => {
    const two = { ...v1, continuityLocks: ['a', 'b'] };
    expect(describeChange(two, { identityAnchors: '七十歲', look: '深藍布衫', continuityLocks: ['b', 'a'] })).toBe('和 v1 的差別：連續性鎖有修改');
  });

  it('文字都沒改而是重生圖片：說明重生了哪一張', () => {
    const same = { identityAnchors: '七十歲', look: '深藍布衫', continuityLocks: ['navy blouse'] };
    expect(describeChange(v1, same, 'sheet')).toBe('和 v1 的差別：重新產生三視圖');
    expect(describeChange(v1, same, 'look')).toBe('和 v1 的差別：重新產生定裝圖');
  });

  it('文字有修改時，不再另外說明重生', () => {
    expect(describeChange(v1, { identityAnchors: '七十歲', look: '灰', continuityLocks: ['navy blouse'] }, 'look')).toBe('和 v1 的差別：造型有修改');
  });
});

describe('版本切換按鈕', () => {
  it('目前的版本加註「目前」', () => {
    expect(versionButtonLabel(2, 2)).toBe('v2 目前');
    expect(versionButtonLabel(1, 2)).toBe('v1');
  });
});
