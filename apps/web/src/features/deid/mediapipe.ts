import type { DetectedFace } from './faceDetector';

/** MediaPipe 偵測結果裡的框（像素） */
export type MediapipeDetection = {
  boundingBox?: { originX: number; originY: number; width: number; height: number } | undefined;
};

/** 每邊往外多遮的比例（以框的寬高計），避免只遮到五官 */
export const FACE_PADDING = 0.15;

/** 把 MediaPipe 的像素框換成比例框：往外多遮一點，並限制在照片範圍內；沒有框的結果略過 */
export function toDetectedFaces(
  _detections: readonly MediapipeDetection[],
  _imageWidth: number,
  _imageHeight: number,
  _padding: number = FACE_PADDING,
): DetectedFace[] {
  throw new Error('尚未實作');
}
