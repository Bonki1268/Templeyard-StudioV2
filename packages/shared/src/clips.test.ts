import { describe, expect, it } from 'vitest';
import { assDialogues, assTime, buildAss, clipGeneratingLabel, generatedClipSec, grayscaleSimilarity, keyframeTimeline, subtitleEvents } from './clips.js';

describe('生成中面板', () => {
  it('影片生成中只顯示內容類型與格數', () => {
    expect(clipGeneratingLabel(4)).toBe('影片・4 格');
  });
});

describe('要生成幾秒', () => {
  it('卡片秒數在模型的範圍內：照卡片秒數', () => {
    expect(generatedClipSec(6, { min: 3, max: 10 })).toBe(6);
  });

  it('卡片秒數低於模型最短長度：生成最短長度，合成時再裁到卡片秒數', () => {
    expect(generatedClipSec(2, { min: 3, max: 10 })).toBe(3);
  });

  it('卡片秒數超過模型最長長度：用最長長度', () => {
    expect(generatedClipSec(12, { min: 3, max: 10 })).toBe(10);
  });

  it('模型沒有限制：照卡片秒數', () => {
    expect(generatedClipSec(7)).toBe(7);
  });
});

describe('軟性控制的關鍵畫格時間軸', () => {
  it('一張關鍵畫格：到那一秒接近關鍵畫格 1，之後停在末格', () => {
    expect(keyframeTimeline(8, [4])).toBe('0～4 秒：第 4 秒的畫面接近關鍵畫格 1；4～8 秒：停在末格');
  });

  it('多張關鍵畫格依時間排序，編號照時間順序', () => {
    expect(keyframeTimeline(10, [6, 3])).toBe('0～3 秒：第 3 秒的畫面接近關鍵畫格 1；3～6 秒：第 6 秒的畫面接近關鍵畫格 2；6～10 秒：停在末格');
  });

  it('小數秒照原樣寫', () => {
    expect(keyframeTimeline(5, [2.5])).toBe('0～2.5 秒：第 2.5 秒的畫面接近關鍵畫格 1；2.5～5 秒：停在末格');
  });

  it('沒有關鍵畫格：空字串（指令裡這一行留白）', () => {
    expect(keyframeTimeline(8, [])).toBe('');
  });
});

describe('成品字幕', () => {
  it('依卡片順序與秒數排出每一句的起訖時間，字幕欄空白的格子不出字幕', () => {
    expect(
      subtitleEvents([
        { durationSec: 6, subtitle: '板橋慈惠宮' },
        { durationSec: 8, subtitle: '' },
        { durationSec: 2, subtitle: '  ' },
        { durationSec: 10, subtitle: '媽祖婆保佑大家平安。' },
      ]),
    ).toEqual([
      { startSec: 0, endSec: 6, text: '板橋慈惠宮' },
      { startSec: 16, endSec: 26, text: '媽祖婆保佑大家平安。' },
    ]);
  });

  it('字幕逐字取自卡片，不改字（前後空白去掉）', () => {
    expect(subtitleEvents([{ durationSec: 3, subtitle: ' 阿嬤說：「來拜拜！」 ' }])[0]?.text).toBe('阿嬤說：「來拜拜！」');
  });

  it('ASS 的時間格式是 H:MM:SS.cc', () => {
    expect(assTime(0)).toBe('0:00:00.00');
    expect(assTime(16)).toBe('0:00:16.00');
    expect(assTime(75.5)).toBe('0:01:15.50');
  });

  it('ASS 字幕檔：1920×1080、Noto Sans TC、白字、下方置中，每一句一行 Dialogue', () => {
    const ass = buildAss([
      { startSec: 0, endSec: 6, text: '板橋慈惠宮' },
      { startSec: 16, endSec: 26, text: '媽祖婆保佑大家平安。' },
    ]);
    expect(ass).toContain('PlayResX: 1920');
    expect(ass).toContain('PlayResY: 1080');
    const style = ass.split('\n').find((line) => line.startsWith('Style:')) ?? '';
    expect(style).toContain('Noto Sans TC');
    // 主要顏色是白色（&H00FFFFFF），對齊是下方置中（2）
    expect(style.split(',')[3]).toBe('&H00FFFFFF');
    expect(style.split(',')[18]).toBe('2');
    const dialogues = ass.split('\n').filter((line) => line.startsWith('Dialogue:'));
    expect(dialogues).toHaveLength(2);
    expect(dialogues[1]).toContain('0:00:16.00,0:00:26.00');
  });

  it('字幕裡的換行寫成 \\N，大括號拿掉（避免被當成 ASS 指令）；取回時文字不變', () => {
    const ass = buildAss([{ startSec: 0, endSec: 3, text: '第一行\n第二行{特效}' }]);
    expect(ass).toContain('第一行\\N第二行特效');
    expect(assDialogues(ass)).toEqual(['第一行\n第二行特效']);
  });

  it('從 ASS 取回字幕文字時，文字裡的逗號不會被切開', () => {
    expect(assDialogues(buildAss([{ startSec: 0, endSec: 3, text: '你好，歡迎來到廟埕' }]))).toEqual(['你好，歡迎來到廟埕']);
    expect(assDialogues(buildAss([{ startSec: 0, endSec: 3, text: 'one, two' }]))).toEqual(['one, two']);
  });
});

describe('偏差比對的相似度', () => {
  it('一模一樣的畫面是 1', () => {
    expect(grayscaleSimilarity(new Uint8Array([10, 200, 30]), new Uint8Array([10, 200, 30]))).toBe(1);
  });

  it('全黑對全白是 0', () => {
    expect(grayscaleSimilarity(new Uint8Array([0, 0]), new Uint8Array([255, 255]))).toBe(0);
  });

  it('1 減去平均像素差，取到小數第 2 位', () => {
    // 差值 51、0 → 平均 25.5 → 1 - 25.5/255 = 0.9
    expect(grayscaleSimilarity(new Uint8Array([0, 100]), new Uint8Array([51, 100]))).toBe(0.9);
  });

  it('兩張大小不同時丟出錯誤', () => {
    expect(() => grayscaleSimilarity(new Uint8Array([1]), new Uint8Array([1, 2]))).toThrow('畫面大小不同');
  });
});
