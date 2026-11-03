import { execFile } from 'node:child_process';
import { rmSync } from 'node:fs';
// 本機 FFmpeg（02「影片合成」）：裁切、放大到 1920×1080、串接、燒錄 ASS 字幕、加背景音樂、loudnorm 統一響度；輸出 H.264、24 fps、AAC

/** 成品規格（01 F15、02） */
export const FINAL_SPEC = { width: 1920, height: 1080, fps: 24 } as const;

export type ComposeClip = {
  /** 片段檔案的絕對路徑 */
  path: string;
  /** 卡片秒數：從頭裁到這個長度 */
  durationSec: number;
};

export type ComposeInput = {
  clips: readonly ComposeClip[];
  /** 背景音樂檔案；沒有時只有各格自帶的聲音 */
  music: string | null;
  /** ASS 字幕檔的路徑 */
  subtitlesPath: string;
  output: string;
};

export type MediaInfo = { width: number | null; height: number | null; fps: number | null; durationSec: number; hasAudio: boolean };

export type Ffmpeg = {
  compose(input: ComposeInput): Promise<void>;
  probe(file: string): Promise<MediaInfo>;
  /**
   * 擷取一個畫面，縮成 width×height 的灰階像素（偏差比對用）。
   * atSec 是影片的時間點；圖片檔傳 null。
   */
  grayFrame(file: string, atSec: number | null, size: { width: number; height: number }): Promise<Uint8Array>;
};

export class FfmpegError extends Error {
  override name = 'FfmpegError';
}

type Run = (args: readonly string[]) => Promise<Buffer>;

function runner(binary: string): Run {
  return (args) =>
    new Promise((resolve, reject) => {
      execFile(binary, [...args], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          const detail = Buffer.from(stderr).toString('utf8').trim().split('\n').slice(-3).join(' ');
          reject(new FfmpegError(detail || error.message));
          return;
        }
        resolve(Buffer.from(stdout));
      });
    });
}

/** 濾鏡參數裡的檔案路徑：跳脫 \ ' : */
function filterPath(file: string): string {
  return `'${file.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:')}'`;
}

function parseRate(rate: string | undefined): number | null {
  if (!rate) return null;
  const [num, den] = rate.split('/').map(Number);
  if (!num || !den) return null;
  return Math.round((num / den) * 100) / 100;
}

type ProbeJson = { streams?: { codec_type?: string; width?: number; height?: number; r_frame_rate?: string }[]; format?: { duration?: string } };

export function createFfmpeg(options: { ffmpegPath?: string | undefined; ffprobePath?: string | undefined } = {}): Ffmpeg {
  const ffmpeg = runner(options.ffmpegPath || 'ffmpeg');
  const ffprobe = runner(options.ffprobePath || 'ffprobe');

  async function probe(file: string): Promise<MediaInfo> {
    const json = JSON.parse((await ffprobe(['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file])).toString('utf8')) as ProbeJson;
    const video = json.streams?.find((s) => s.codec_type === 'video');
    return {
      width: video?.width ?? null,
      height: video?.height ?? null,
      fps: parseRate(video?.r_frame_rate),
      durationSec: Number(json.format?.duration ?? 0),
      hasAudio: Boolean(json.streams?.some((s) => s.codec_type === 'audio')),
    };
  }

  async function compose(input: ComposeInput): Promise<void> {
    const { width, height, fps } = FINAL_SPEC;
    const total = input.clips.reduce((sum, clip) => sum + clip.durationSec, 0);
    try {
      const infos = await Promise.all(input.clips.map((clip) => probe(clip.path)));
      const args: string[] = ['-hide_banner', '-loglevel', 'error', '-y'];
      for (const clip of input.clips) args.push('-i', clip.path);
      if (input.music) args.push('-i', input.music);

      const filters: string[] = [];
      input.clips.forEach((clip, index) => {
        const d = clip.durationSec;
        // 從頭裁到卡片秒數；不足時延長最後一個畫面；放大（或縮小）到 1920×1080，補邊不變形
        filters.push(
          // 先裁切與換成 24 fps 再放大，少處理用不到的畫面
          `[${index}:v]trim=0:${d},setpts=PTS-STARTPTS,fps=${fps},tpad=stop_mode=clone:stop_duration=${d},trim=0:${d},` +
            `scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=bicubic,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v${index}]`,
        );
        filters.push(
          infos[index]?.hasAudio
            ? `[${index}:a]aresample=48000,aformat=channel_layouts=stereo,apad,atrim=0:${d},asetpts=PTS-STARTPTS[a${index}]`
            : `anullsrc=r=48000:cl=stereo,atrim=0:${d},asetpts=PTS-STARTPTS[a${index}]`,
        );
      });
      const pairs = input.clips.map((_, index) => `[v${index}][a${index}]`).join('');
      filters.push(`${pairs}concat=n=${input.clips.length}:v=1:a=1[vc][ac]`);
      filters.push(`[vc]ass=${filterPath(input.subtitlesPath)}[vout]`);
      if (input.music) {
        const m = input.clips.length;
        filters.push(`[${m}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${total},asetpts=PTS-STARTPTS,volume=0.35[music]`);
        filters.push('[ac][music]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mix]');
        filters.push('[mix]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[aout]');
      } else {
        filters.push('[ac]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[aout]');
      }
      args.push(
        '-filter_complex', filters.join(';'),
        '-map', '[vout]', '-map', '[aout]',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(fps),
        '-c:a', 'aac', '-b:a', '192k',
        '-t', String(total),
        '-movflags', '+faststart',
        input.output,
      );
      await ffmpeg(args);
    } catch (error: unknown) {
      rmSync(input.output, { force: true });
      throw new FfmpegError(`合成失敗：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function grayFrame(file: string, atSec: number | null, size: { width: number; height: number }): Promise<Uint8Array> {
    const seek = atSec === null ? [] : ['-ss', String(atSec)];
    const bytes = await ffmpeg([
      '-hide_banner', '-loglevel', 'error',
      ...seek,
      '-i', file,
      '-frames:v', '1',
      '-vf', `scale=${size.width}:${size.height},format=gray`,
      '-f', 'rawvideo', 'pipe:1',
    ]);
    if (bytes.length !== size.width * size.height) throw new FfmpegError(`擷取畫面失敗：${file}`);
    return new Uint8Array(bytes);
  }

  return { compose, probe, grayFrame };
}
