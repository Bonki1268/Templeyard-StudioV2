import { PHOTO_MIME_TYPES, type DeidBox, type Photo, type PhotoMime, type StandardViewKey } from '@templeyard/shared';
import { assetUrl, patchPhoto, postOriginalPhoto, postPhoto } from '../../api/client';
import { boxesFromDetections } from '../deid/boxes';
import { getFaceDetector } from '../deid/faceDetector';
import { DEID_OUTPUT_MIME, blobToBase64, loadImage, renderDeidentified } from '../deid/render';

// 一張照片的處理流程：在瀏覽器偵測臉孔並遮蔽 → 原圖存本機 → 去識別後的圖存本機（之後才可能送往雲端）

/** 給使用者看的錯誤 */
export class PhotoProcessError extends Error {
  override name = 'PhotoProcessError';
}

export const DETECTOR_UNAVAILABLE_MESSAGE = '人臉偵測無法使用，照片沒有上傳。請重新整理頁面後再試一次。';

function isPhotoMime(type: string): type is PhotoMime {
  return (PHOTO_MIME_TYPES as readonly string[]).includes(type);
}

export async function processAndUploadPhoto(videoId: string, file: File, viewKey: StandardViewKey | null): Promise<Photo> {
  if (!isPhotoMime(file.type)) throw new PhotoProcessError(`「${file.name}」不是 JPEG、PNG 或 WebP 照片，沒有上傳。`);

  const image = await loadImage(file).catch(() => {
    throw new PhotoProcessError(`「${file.name}」打不開，沒有上傳。`);
  });

  // 偵測失敗就不上傳：沒有遮蔽過的照片不能存成「已去識別」
  let boxes: DeidBox[];
  try {
    const detector = await getFaceDetector();
    boxes = boxesFromDetections(await detector.detect(image));
  } catch {
    throw new PhotoProcessError(DETECTOR_UNAVAILABLE_MESSAGE);
  }

  const deidentified = await renderDeidentified(image, boxes);
  const original = await postOriginalPhoto(videoId, { mime: file.type, dataBase64: await blobToBase64(file) });
  return postPhoto(videoId, {
    originalAssetId: original.id,
    deidentified: { mime: DEID_OUTPUT_MIME, dataBase64: await blobToBase64(deidentified) },
    deidBoxes: boxes,
    viewKey,
  });
}

/** 依調整後的遮蔽框，從本機原圖重新產生去識別後的圖 */
export async function saveMasks(videoId: string, photo: Photo, boxes: readonly DeidBox[]): Promise<Photo> {
  const image = await loadImage(assetUrl(photo.originalAssetId));
  const deidentified = await renderDeidentified(image, boxes);
  return patchPhoto(videoId, photo.id, {
    deidentified: { mime: DEID_OUTPUT_MIME, dataBase64: await blobToBase64(deidentified) },
    deidBoxes: [...boxes],
  });
}
