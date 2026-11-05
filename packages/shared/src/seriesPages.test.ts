import { describe, expect, it } from 'vitest';
import { filterVideos, formatDuration, parseVideoFilter, parseVideoSort, sortVideos, videoCounts, videoStatus, videoTitle } from './seriesPages.js';

describe('影片標題', () => {
  it('沒有想講的故事時只有寺廟名稱', () => {
    expect(videoTitle('板橋慈惠宮', null)).toBe('板橋慈惠宮');
    expect(videoTitle('板橋慈惠宮', '   ')).toBe('板橋慈惠宮');
  });

  it('有想講的故事時接在寺廟名稱後面', () => {
    expect(videoTitle('板橋慈惠宮', '講媽祖顯靈救漁民的故事')).toBe('板橋慈惠宮：講媽祖顯靈救漁民的故事');
  });

  it('故事超過 16 字截斷並加「…」，換行當成空白', () => {
    expect(videoTitle('清水巖', '一二三四五六七八九十一二三四五六七八')).toBe('清水巖：一二三四五六七八九十一二三四五六…');
    expect(videoTitle('清水巖', '午後\n的廟埕')).toBe('清水巖：午後 的廟埕');
  });
});

describe('影片狀態細節', () => {
  it.each([
    ['creating', 0, 0, '建立中', 'wip'],
    ['board_pending', 0, 0, '寺廟定裝版待確認', 'wip'],
    ['chat', 0, 0, '創作對話', 'wip'],
    ['questionnaire', 0, 0, '設定問卷', 'wip'],
    ['plan', 0, 0, '分鏡方案', 'wip'],
    ['frames_generating', 0, 0, '精緻圖生成中', 'wip'],
    ['frames', 0, 0, '精緻圖', 'wip'],
    ['video_generating', 0, 0, '影片生成中', 'wip'],
    ['final', 0, 0, '成品待確認', 'wip'],
    ['done', 0, 0, '完成', 'done'],
  ] as const)('階段 %s（%i 格精緻圖、%i 格影片需重新確認）：「%s」，分在「%s」', (stage, staleFrames, staleClips, label, group) => {
    expect(videoStatus({ stage, staleFrames, staleClips })).toEqual({ label, group });
  });

  it('精緻圖階段有格子需重新確認時，標籤帶上格數', () => {
    expect(videoStatus({ stage: 'frames', staleFrames: 2, staleClips: 0 }).label).toBe('精緻圖・2 格需重新確認');
  });

  it('成品階段有影片需重新確認時，標籤帶上格數', () => {
    expect(videoStatus({ stage: 'final', staleFrames: 0, staleClips: 3 }).label).toBe('成品・3 格需重新確認');
  });

  it('已完成的影片不顯示需重新確認', () => {
    expect(videoStatus({ stage: 'done', staleFrames: 1, staleClips: 1 }).label).toBe('完成');
  });
});

describe('篩選與數量', () => {
  const videos = [
    { id: 'a', group: 'wip' as const },
    { id: 'b', group: 'done' as const },
    { id: 'c', group: 'wip' as const },
  ];

  it('全部不篩；製作中與完成各取自己的', () => {
    expect(filterVideos(videos, 'all').map((v) => v.id)).toEqual(['a', 'b', 'c']);
    expect(filterVideos(videos, 'wip').map((v) => v.id)).toEqual(['a', 'c']);
    expect(filterVideos(videos, 'done').map((v) => v.id)).toEqual(['b']);
  });

  it('數量：全部、製作中、完成', () => {
    expect(videoCounts(videos)).toEqual({ all: 3, wip: 2, done: 1 });
    expect(videoCounts([])).toEqual({ all: 0, wip: 0, done: 0 });
  });
});

describe('排序', () => {
  const videos = [
    { id: 'a', templeName: '新莊地藏庵', createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-03T00:00:00Z' },
    { id: 'b', templeName: '板橋慈惠宮', createdAt: '2026-11-02T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z' },
    { id: 'c', templeName: '清水巖', createdAt: '2026-11-03T00:00:00Z', updatedAt: '2026-11-04T00:00:00Z' },
  ];

  it('最近更新：新的在前', () => {
    expect(sortVideos(videos, 'updated').map((v) => v.id)).toEqual(['c', 'a', 'b']);
  });

  it('建立時間：新的在前', () => {
    expect(sortVideos(videos, 'created').map((v) => v.id)).toEqual(['c', 'b', 'a']);
  });

  it('寺廟名稱：依字元順序', () => {
    expect(sortVideos(videos, 'temple').map((v) => v.templeName)).toEqual(['新莊地藏庵', '板橋慈惠宮', '清水巖'].sort());
  });

  it('時間相同時依編號，結果固定；不改動傳入的陣列', () => {
    const same = [
      { id: 'x', templeName: '甲', createdAt: 't', updatedAt: 't' },
      { id: 'y', templeName: '甲', createdAt: 't', updatedAt: 't' },
    ];
    expect(sortVideos(same, 'updated').map((v) => v.id)).toEqual(['y', 'x']);
    expect(same.map((v) => v.id)).toEqual(['x', 'y']);
  });
});

describe('查詢參數', () => {
  it('沒傳用預設；清單內的值照用；不在清單回傳 null', () => {
    expect(parseVideoFilter(undefined)).toBe('all');
    expect(parseVideoFilter('wip')).toBe('wip');
    expect(parseVideoFilter('nobody')).toBeNull();
    expect(parseVideoSort(undefined)).toBe('updated');
    expect(parseVideoSort('temple')).toBe('temple');
    expect(parseVideoSort('nobody')).toBeNull();
  });
});

describe('成品長度', () => {
  it.each([
    [28, '0:28'],
    [30, '0:30'],
    [65, '1:05'],
    [0, '0:00'],
  ])('%i 秒顯示 %s', (sec, text) => {
    expect(formatDuration(sec)).toBe(text);
  });
});
