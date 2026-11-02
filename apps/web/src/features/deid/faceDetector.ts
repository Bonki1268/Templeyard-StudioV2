// 人臉偵測的介面：真的偵測用 MediaPipe（mediapipe.ts），情境測試用假的（tests/fakes/face-detector/）。

/** 偵測到的臉：位置與大小以照片寬高的比例表示（0～1） */
export type DetectedFace = { x: number; y: number; width: number; height: number };

export interface FaceDetector {
  detect(image: HTMLImageElement): Promise<DetectedFace[]>;
}

declare global {
  interface Window {
    /** 只在開發模式下使用：情境測試在頁面載入前放入假的偵測器 */
    __templeyardFaceDetector?: FaceDetector;
  }
}

let loading: Promise<FaceDetector> | null = null;

/** 取得人臉偵測器；第一次呼叫時才載入 MediaPipe 模型（之後重複使用）。載入失敗時下次會重試 */
export function getFaceDetector(): Promise<FaceDetector> {
  if (import.meta.env.DEV && window.__templeyardFaceDetector) return Promise.resolve(window.__templeyardFaceDetector);
  loading ??= import('./mediapipeDetector')
    .then((module) => module.createMediapipeDetector())
    .catch((error: unknown) => {
      loading = null;
      throw error;
    });
  return loading;
}
