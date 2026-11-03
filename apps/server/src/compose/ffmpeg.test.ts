import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildAss, subtitleEvents } from '@templeyard/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FINAL_SPEC, createFfmpeg, type Ffmpeg } from './ffmpeg.js';

// 06 第 11 階段完成條件：以測試素材跑合成，輸出 1920×1080、24 fps、長度與卡片秒數總和一致；字幕文字與卡片字幕欄一致。
// 用本機 FFmpeg 產生測試素材（不花錢）

let dir: string;
let ffmpeg: Ffmpeg;

/** 1280×720、30 fps、有聲音的測試片段 */
function makeClip(name: string, seconds: number, options: { audio?: boolean } = {}): string {
  const file = path.join(dir, name);
  const audio = options.audio ?? true;
  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', `testsrc2=size=1280x720:rate=30:duration=${seconds}`,
    ...(audio ? ['-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`] : []),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast',
    ...(audio ? ['-c:a', 'aac'] : []),
    file,
  ]);
  return file;
}

function makeImage(name: string, color: string): string {
  const file = path.join(dir, name);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:size=320x180`, '-frames:v', '1', file]);
  return file;
}

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'compose-test-'));
  ffmpeg = createFfmpeg();
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('合成成品', () => {
  it('裁到卡片秒數、放大到 1920×1080、24 fps、串接；長度等於卡片秒數總和，有聲音', async () => {
    // 生成長度大於卡片秒數時從頭裁；第 3 格沒有聲音也能串接
    const shots = [
      { file: makeClip('a.mp4', 6), durationSec: 4, subtitle: '板橋慈惠宮' },
      { file: makeClip('b.mp4', 5), durationSec: 3, subtitle: '' },
      { file: makeClip('c.mp4', 4, { audio: false }), durationSec: 3, subtitle: '媽祖婆保佑大家平安。' },
    ];
    const subtitlesPath = path.join(dir, 'subs.ass');
    writeFileSync(subtitlesPath, buildAss(subtitleEvents(shots)));
    const output = path.join(dir, 'final.mp4');

    await ffmpeg.compose({ clips: shots.map((s) => ({ path: s.file, durationSec: s.durationSec })), music: null, subtitlesPath, output });

    const info = await ffmpeg.probe(output);
    expect(info).toMatchObject({ width: FINAL_SPEC.width, height: FINAL_SPEC.height, fps: FINAL_SPEC.fps, hasAudio: true });
    expect(Math.abs(info.durationSec - 10)).toBeLessThan(0.15);
  });

  it('加入背景音樂：音樂比成品長時裁掉，成品長度不變', async () => {
    const music = path.join(dir, 'music.wav');
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=30', '-ac', '1', '-ar', '16000', music]);
    const subtitlesPath = path.join(dir, 'subs2.ass');
    writeFileSync(subtitlesPath, buildAss([{ startSec: 0, endSec: 2, text: '歡迎' }]));
    const output = path.join(dir, 'final-music.mp4');

    await ffmpeg.compose({ clips: [{ path: makeClip('d.mp4', 5), durationSec: 5 }], music, subtitlesPath, output });

    const info = await ffmpeg.probe(output);
    expect(info.hasAudio).toBe(true);
    expect(Math.abs(info.durationSec - 5)).toBeLessThan(0.15);
  });

  it('字幕燒錄在畫面上：有字幕的時段，畫面下方和沒有字幕時不同', async () => {
    const clip = makeClip('e.mp4', 4);
    const plain = path.join(dir, 'plain.ass');
    const withText = path.join(dir, 'text.ass');
    writeFileSync(plain, buildAss([]));
    writeFileSync(withText, buildAss([{ startSec: 0, endSec: 4, text: '板橋慈惠宮歡迎你' }]));
    const a = path.join(dir, 'no-sub.mp4');
    const b = path.join(dir, 'sub.mp4');
    await ffmpeg.compose({ clips: [{ path: clip, durationSec: 4 }], music: null, subtitlesPath: plain, output: a });
    await ffmpeg.compose({ clips: [{ path: clip, durationSec: 4 }], music: null, subtitlesPath: withText, output: b });

    const frameA = await ffmpeg.grayFrame(a, 2, { width: 192, height: 108 });
    const frameB = await ffmpeg.grayFrame(b, 2, { width: 192, height: 108 });
    // 下方 1/5 的像素
    const bottom = (frame: Uint8Array) => frame.slice(192 * 86);
    const diff = bottom(frameA).reduce((sum, value, index) => sum + Math.abs(value - (bottom(frameB)[index] ?? 0)), 0);
    expect(diff).toBeGreaterThan(0);
  });

  it('片段檔案壞掉時丟出合成錯誤，不留下成品', async () => {
    const broken = path.join(dir, 'broken.mp4');
    writeFileSync(broken, 'not a video');
    const subtitlesPath = path.join(dir, 'subs3.ass');
    writeFileSync(subtitlesPath, buildAss([]));
    await expect(ffmpeg.compose({ clips: [{ path: broken, durationSec: 3 }], music: null, subtitlesPath, output: path.join(dir, 'x.mp4') })).rejects.toThrow('合成失敗');
  });
});

describe('擷取畫面', () => {
  it('圖片縮成指定大小的灰階像素', async () => {
    const pixels = await ffmpeg.grayFrame(makeImage('white.png', 'white'), null, { width: 16, height: 9 });
    expect(pixels).toHaveLength(16 * 9);
    expect(pixels.every((value) => value > 240)).toBe(true);
  });

  it('影片取指定秒數的畫面', async () => {
    const pixels = await ffmpeg.grayFrame(makeClip('f.mp4', 3), 1.5, { width: 32, height: 18 });
    expect(pixels).toHaveLength(32 * 18);
  });

  it('讀不到的檔案丟出錯誤', async () => {
    await expect(ffmpeg.grayFrame(path.join(dir, 'missing.png'), null, { width: 4, height: 4 })).rejects.toThrow();
  });
});
