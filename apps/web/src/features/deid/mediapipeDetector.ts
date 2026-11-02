import { FaceDetector as MediapipeFaceDetector } from '@mediapipe/tasks-vision';
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
import type { FaceDetector } from './faceDetector';
import { toDetectedFaces } from './mediapipe';

// MediaPipe Face Detector（02「去識別」）：在瀏覽器裡執行，照片不離開這台電腦。
// 模型檔 blaze_face_short_range.tflite 放在 public/models/（Apache-2.0），WASM 由套件提供，都從本機載入。

const MODEL_PATH = '/models/blaze_face_short_range.tflite';

/** 偵測門檻：寧可多遮也不要漏遮，誤判的框由使用者取消 */
const MIN_DETECTION_CONFIDENCE = 0.3;

export async function createMediapipeDetector(): Promise<FaceDetector> {
  const detector = await MediapipeFaceDetector.createFromOptions(
    { wasmLoaderPath, wasmBinaryPath },
    {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'CPU' },
      runningMode: 'IMAGE',
      minDetectionConfidence: MIN_DETECTION_CONFIDENCE,
    },
  );
  return {
    detect: async (image) =>
      toDetectedFaces(detector.detect(image).detections, image.naturalWidth, image.naturalHeight),
  };
}
