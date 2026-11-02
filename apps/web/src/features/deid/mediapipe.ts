import type { DetectedFace } from './faceDetector';

/** MediaPipe 偵測結果裡的框（像素） */
export type MediapipeDetection = {
  boundingBox?: { originX: number; originY: number; width: number; height: number } | undefined;
};

/** 每邊往外多遮的比例（以框的寬高計），避免只遮到五官 */
export const FACE_PADDING = 0.15;

/** 把 MediaPipe 的像素框換成比例框：往外多遮一點，並限制在照片範圍內；沒有框的結果略過 */
export function toDetectedFaces(
  detections: readonly MediapipeDetection[],
  imageWidth: number,
  imageHeight: number,
  padding: number = FACE_PADDING,
): DetectedFace[] {
  const faces: DetectedFace[] = [];
  for (const { boundingBox: box } of detections) {
    if (!box) continue;
    const padX = box.width * padding;
    const padY = box.height * padding;
    const left = Math.max(0, box.originX - padX);
    const top = Math.max(0, box.originY - padY);
    const right = Math.min(imageWidth, box.originX + box.width + padX);
    const bottom = Math.min(imageHeight, box.originY + box.height + padY);
    if (right <= left || bottom <= top) continue;
    faces.push({
      x: left / imageWidth,
      y: top / imageHeight,
      width: (right - left) / imageWidth,
      height: (bottom - top) / imageHeight,
    });
  }
  return faces;
}
