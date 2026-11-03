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

export function createFfmpeg(options: { ffmpegPath?: string | undefined; ffprobePath?: string | undefined } = {}): Ffmpeg {
  void options;
  const notYet = (): never => {
    throw new Error('尚未實作');
  };
  return { compose: async () => notYet(), probe: async () => notYet(), grayFrame: async () => notYet() };
}
