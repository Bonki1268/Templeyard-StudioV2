import {
  MAX_TEMPLE_PHOTOS,
  createPhotoSchema,
  updatePhotoSchema,
  uploadOriginalSchema,
  type AssetKind,
  type ImageUpload,
  type Photo,
  type Video,
} from '@templeyard/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { findAsset, insertAsset } from '../assets/repository.js';
import { sniffImageMime } from '../assets/sniff.js';
import type { AssetStore } from '../assets/store.js';
import type { AppDatabase } from '../db/client.js';
import { toValidationError } from '../http/errors.js';
import { errorBody } from '../http/errorBody.js';
import { countTemplePhotos, findPhoto, insertPhoto, updatePhoto } from '../photos/repository.js';
import type { Clock } from '../series/repository.js';
import { findVideo } from '../videos/repository.js';

const INVALID_MESSAGE = '照片資料不正確';

/** 照片以 base64 放在 JSON 裡，最大約 30MB；請求本身放寬到 50MB */
const PHOTO_BODY_LIMIT = 50 * 1024 * 1024;

type VideoParams = { Params: { id: string } };
type PhotoParams = { Params: { id: string; photoId: string } };

/** 這支影片看得到這張照片：同系列同一間廟的寺廟照片，或這支影片自己的補充照片 */
function visibleTo(photo: Photo, video: Video): boolean {
  return (
    photo.seriesId === video.seriesId &&
    photo.templeId === video.templeId &&
    (photo.videoId === null || photo.videoId === video.id)
  );
}

/**
 * POST /api/videos/:id/photos/originals：原圖，只存本機（cloud_ok = 0）
 * POST /api/videos/:id/photos：去識別後的照片
 * PATCH /api/videos/:id/photos/:photoId：改視角或重新遮蔽
 */
export function registerPhotoRoutes(app: FastifyInstance, db: AppDatabase, clock: Clock, store: AssetStore): void {
  /** 解出圖片位元組並寫入資產；內容和宣告的格式不符時回應 400 並回傳 null */
  function saveImage(reply: FastifyReply, kind: AssetKind, image: ImageUpload) {
    const bytes = Buffer.from(image.dataBase64, 'base64');
    if (sniffImageMime(bytes) !== image.mime) {
      void reply.status(400).send(errorBody('照片內容和格式不符'));
      return null;
    }
    const id = clock.newId();
    const saved = store.save({ id, kind, mime: image.mime, bytes });
    return insertAsset(db, { id, kind, mime: image.mime, path: saved.path, sha256: saved.sha256 });
  }

  app.post<VideoParams>('/api/videos/:id/photos/originals', { bodyLimit: PHOTO_BODY_LIMIT }, async (request, reply) => {
    if (!findVideo(db, request.params.id)) return reply.status(404).send(errorBody('找不到這支影片'));
    const parsed = uploadOriginalSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send(toValidationError(parsed.error, INVALID_MESSAGE));
    const asset = saveImage(reply, 'original_photo', parsed.data);
    if (!asset) return reply;
    return reply.status(201).send({ asset });
  });

  app.post<VideoParams>('/api/videos/:id/photos', { bodyLimit: PHOTO_BODY_LIMIT }, async (request, reply) => {
    const video = findVideo(db, request.params.id);
    if (!video) return reply.status(404).send(errorBody('找不到這支影片'));
    const parsed = createPhotoSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send(toValidationError(parsed.error, INVALID_MESSAGE));

    const original = findAsset(db, parsed.data.originalAssetId);
    if (!original) return reply.status(404).send(errorBody('找不到這張照片的原圖'));
    if (original.kind !== 'original_photo') return reply.status(400).send(errorBody('原圖編號指向的不是原圖'));
    if (countTemplePhotos(db, video.seriesId, video.templeId) >= MAX_TEMPLE_PHOTOS) {
      return reply.status(409).send(errorBody(`每間廟最多 ${MAX_TEMPLE_PHOTOS} 張照片`));
    }

    const deid = saveImage(reply, 'deid_photo', parsed.data.deidentified);
    if (!deid) return reply;
    const photo = insertPhoto(
      db,
      {
        seriesId: video.seriesId,
        templeId: video.templeId,
        // 第 2 步上傳的是寺廟照片，同系列的影片共用；第 3 步的補充照片之後才有
        videoId: null,
        originalAssetId: original.id,
        deidentifiedAssetId: deid.id,
        viewKey: parsed.data.viewKey ?? null,
        deidBoxes: parsed.data.deidBoxes,
      },
      clock,
    );
    return reply.status(201).send({ photo });
  });

  app.patch<PhotoParams>('/api/videos/:id/photos/:photoId', { bodyLimit: PHOTO_BODY_LIMIT }, async (request, reply) => {
    const video = findVideo(db, request.params.id);
    if (!video) return reply.status(404).send(errorBody('找不到這支影片'));
    const photo = findPhoto(db, request.params.photoId);
    if (!photo || !visibleTo(photo, video)) return reply.status(404).send(errorBody('找不到這張照片'));
    const parsed = updatePhotoSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send(toValidationError(parsed.error, INVALID_MESSAGE));

    const changes: { viewKey?: string | null; deidentifiedAssetId?: string; deidBoxes?: Photo['deidBoxes'] } = {};
    if (parsed.data.viewKey !== undefined) changes.viewKey = parsed.data.viewKey;
    if (parsed.data.deidentified && parsed.data.deidBoxes) {
      // 舊的去識別圖不刪除，只是不再被這張照片使用
      const deid = saveImage(reply, 'deid_photo', parsed.data.deidentified);
      if (!deid) return reply;
      changes.deidentifiedAssetId = deid.id;
      changes.deidBoxes = parsed.data.deidBoxes;
    }
    const updated = updatePhoto(db, photo.id, changes);
    if (!updated) return reply.status(404).send(errorBody('找不到這張照片'));
    return { photo: updated };
  });
}
