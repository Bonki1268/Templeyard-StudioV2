import { UploadNotConfiguredError, type CloudAssetRef } from '@templeyard/comfy-client';
import { CallBuildError, attachReferenceImages, buildMcpCall, composeFinalPrompt, renderPrompt, type PromptWriter } from '@templeyard/prompts';
import {
  BOARD_CONFIRMED_MESSAGE,
  DEFAULT_TEMPLE_LIGHTING,
  NO_PHOTO_MESSAGE,
  NO_VIEW_MESSAGE,
  boardPendingItems,
  generateTempleBoardSchema,
  planBoardViews,
  regenerateTempleViewSchema,
  updateTempleBoardSchema,
  viewName,
  type AddSupplementalViewInput,
  type CloudOkAsset,
  type CostCheck,
  type CostItem,
  type GenerateTempleBoardInput,
  type McpCall,
  type Photo,
  type PromptFile,
  type RegenerateTempleViewInput,
  type ReusableTempleBoard,
  type TempleBoard,
  type TempleView,
  type UpdateTempleBoardInput,
  type Video,
  type WorkflowConfig,
  type WorkflowModel,
} from '@templeyard/shared';
import { eq } from 'drizzle-orm';
import { getCloudOkAsset } from '../assets/repository.js';
import type { AssetStore } from '../assets/store.js';
import type { AppDatabase } from '../db/client.js';
import { templeBoards, templeBoardVersions, templeViews, videos, type TempleBoardVersionRow, type TempleViewRow, type VideoRow } from '../db/schema.js';
import type { GenerationRequest, GenerationService, SucceededHandler } from '../generations/service.js';
import { listPhotosForVideo } from '../photos/repository.js';
import { findSeries, type Clock } from '../series/repository.js';
import { findTemple } from '../temples/repository.js';
import { findVideo } from '../videos/repository.js';
import {
  findBoard,
  findBoardById,
  findVersion,
  findView,
  hasBoardConfirmation,
  insertBoard,
  insertConfirmation,
  insertVersion,
  insertViews,
  latestViewGeneration,
  listViews,
  nextVersionNumber,
  setCurrentVersion,
  updateVersion,
  updateView,
} from './repository.js';
import { templeViewVariables } from './viewPrompt.js';

// 寺廟定裝版（03「/videos/:vid/temple-board」、05「temple_boards」、規格書「產生寺廟定裝版」）

export const TEMPLE_VIEW_NODE = 'temple-view';

/** 定裝版的操作錯誤；status 對應 HTTP 狀態碼 */
export class TempleBoardError extends Error {
  override name = 'TempleBoardError';
  constructor(
    readonly status: 400 | 404 | 409 | 502 | 503,
    message: string,
  ) {
    super(message);
  }
}

export type TempleBoardGeneration = {
  service: GenerationService;
  writer: PromptWriter;
  /** 把去識別後的照片送到雲端；型別上只收 cloud_ok 的資產 */
  sendAsset: (asset: CloudOkAsset) => Promise<CloudAssetRef>;
};

export type TempleBoardServiceDeps = {
  db: AppDatabase;
  clock: Clock;
  workflows: WorkflowConfig;
  prompts: ReadonlyMap<string, PromptFile>;
  store: AssetStore;
  /** 沒有設定 Comfy Cloud 或 Claude 時為 null：生成相關的操作回 503，說明 unavailableMessage */
  generation: TempleBoardGeneration | null;
  unavailableMessage?: string;
};

export type GenerateOutcome = { status: 'consent_required'; check: CostCheck } | { status: 'accepted'; board: TempleBoard };

export type TempleBoardService = {
  /** 這支影片使用的定裝版；還沒有時為 null */
  detail(videoId: string): TempleBoard | null;
  /** 同系列同一間廟目前確認過的版本（建立影片頁的「沿用定裝版」） */
  reusableFor(seriesId: string, templeId: string): ReusableTempleBoard | null;
  /**
   * 產生寺廟定裝版：檢查照片與視角 → 檢查同意（不作廢）→ 每個視角請撰寫者寫最終指令、上傳參考圖、組出 MCP 呼叫
   * → 一次送出（作廢同意憑證）→ 建立定裝版與視角列、鎖定模型、影片進入 board_pending。
   * 任何一步失敗都不留下定裝版、不鎖定模型。
   */
  generate(videoId: string, input: GenerateTempleBoardInput): Promise<GenerateOutcome>;
  /** 單張重生（可帶修改指令）；有這個視角的照片時改為依照片；完成後替換該張並標示需重新確認 */
  regenerateView(videoId: string, viewKey: string, input: RegenerateTempleViewInput): Promise<GenerateOutcome>;
  confirmView(videoId: string, viewKey: string): TempleBoard;
  update(videoId: string, input: UpdateTempleBoardInput): TempleBoard;
  /** 確認定裝版：所有視角都產生且確認後才可以；影片進入 chat，記下確認紀錄 */
  confirm(videoId: string): { board: TempleBoard; video: Video };
  /** 沿用同系列同一間廟確認過的版本；鎖定模型 */
  reuse(videoId: string): TempleBoard;
  /** 以這支影片目前（已確認）的版本另存新版本：複製視角圖與外觀規範，新版本尚未確認 */
  saveAsNewVersion(videoId: string): TempleBoard;
  /**
   * 補充視角（F11）：在這支影片使用的定裝版加上一個 AI 推測的視角（記下由哪支影片補充），送出生成。
   * 已經有同名的視角：409「寺廟定裝版已經有「名稱」」；沒有同意憑證：consent_required
   */
  addSupplementalView(videoId: string, input: AddSupplementalViewInput): Promise<GenerateOutcome>;
  /** 確認補充的視角；只能確認這支影片補充、已產生完成的視角；找不到：404「找不到這個視角」 */
  confirmSupplementalView(videoId: string, viewKey: string): TempleBoard;
  /** 生成服務的 temple-view 完成處理：把視角圖接到視角列 */
  handleGenerated: SucceededHandler;
};

const PROMPT_ID = 'temple-view';
const OUTPUT_KIND = 'view';
const BOARD_NOT_FOUND = '這支影片還沒產生寺廟定裝版';
const VIEW_NOT_FOUND = '這個定裝版沒有這個視角';
const UNAVAILABLE_DEFAULT = '還沒設定生成服務，不能生成';

type ViewTarget = { viewId: string; viewKey: string; boardVersionId: string; autoConfirm: boolean };

function isViewTarget(value: Record<string, unknown>): value is ViewTarget {
  return typeof value.viewId === 'string' && typeof value.autoConfirm === 'boolean';
}

export function createTempleBoardService(deps: TempleBoardServiceDeps): TempleBoardService {
  const { db, clock } = deps;
  const nowIso = () => clock.now().toISOString();

  function requireVideo(videoId: string): Video {
    const video = findVideo(db, videoId);
    if (!video) throw new TempleBoardError(404, '找不到這支影片');
    return video;
  }

  function requireGeneration(): TempleBoardGeneration {
    if (!deps.generation) throw new TempleBoardError(503, deps.unavailableMessage ?? UNAVAILABLE_DEFAULT);
    return deps.generation;
  }

  function prompt(): PromptFile {
    const found = deps.prompts.get(PROMPT_ID);
    if (!found) throw new TempleBoardError(503, '找不到 temple-view 的生成指令');
    return found;
  }

  function modelOf(key: string): WorkflowModel {
    const model = deps.workflows.models[key];
    if (!model) throw new TempleBoardError(503, `沒有這個模型的呼叫設定：${key}`);
    return model;
  }

  /** 視角目前的狀態：依最近一次的生成紀錄 */
  function toView(row: TempleViewRow): TempleView {
    const latest = latestViewGeneration(db, TEMPLE_VIEW_NODE, row.id);
    let state: TempleView['state'] = 'ready';
    let error: string | null = null;
    if (latest && ['awaiting_confirm', 'submitted', 'running'].includes(latest.status)) state = 'generating';
    else if (latest && (latest.status === 'failed' || latest.status === 'timeout')) {
      state = 'failed';
      error = latest.error;
    } else if (!row.assetId) state = 'generating';
    return {
      id: row.id,
      viewKey: row.viewKey,
      viewName: row.viewName,
      source: row.source,
      photoId: row.photoId,
      assetId: row.assetId,
      confirmed: row.confirmed,
      state,
      error,
      lastInstruction: latest?.userInstruction ?? null,
      createdFromVideoId: row.createdFromVideoId,
    };
  }

  function toBoard(video: Video, version: TempleBoardVersionRow): TempleBoard {
    const board = findBoardById(db, version.boardId);
    if (!board) throw new TempleBoardError(404, BOARD_NOT_FOUND);
    const views = listViews(db, version.id).map(toView);
    return {
      boardId: board.id,
      seriesId: board.seriesId,
      templeId: board.templeId,
      templeName: findTemple(db, board.templeId)?.name ?? '',
      videoId: video.id,
      version: {
        id: version.id,
        boardId: version.boardId,
        version: version.version,
        imageModel: version.imageModel,
        appearanceLocks: version.appearanceLocks,
        defaultLighting: version.defaultLighting,
        confirmedAt: version.confirmedAt,
      },
      views,
      otherImageModel: version.imageModel !== video.imageModel,
      pending: boardPendingItems(views),
    };
  }

  /** 這支影片的定裝版版本；沒有時丟出 404 */
  function current(videoId: string): { video: Video; version: TempleBoardVersionRow } {
    const video = requireVideo(videoId);
    const version = video.templeBoardVersionId ? findVersion(db, video.templeBoardVersionId) : null;
    if (!version) throw new TempleBoardError(404, BOARD_NOT_FOUND);
    return { video, version };
  }

  function editable(videoId: string) {
    const found = current(videoId);
    if (found.version.confirmedAt) throw new TempleBoardError(409, BOARD_CONFIRMED_MESSAGE);
    return found;
  }

  function setVideo(id: string, patch: Partial<Pick<VideoRow, 'stage' | 'modelsLockedAt' | 'templeBoardVersionId'>>) {
    db.update(videos).set({ ...patch, updatedAt: nowIso() }).where(eq(videos.id, id)).run();
  }

  /** 參考照片：這個視角自己的照片排前面，其他照片接在後面，最多 max 張 */
  function referencePhotos(all: readonly Photo[], ownIds: readonly string[], max: number): Photo[] {
    const own = all.filter((photo) => ownIds.includes(photo.id));
    const others = all.filter((photo) => !ownIds.includes(photo.id));
    return [...own, ...others].slice(0, max);
  }

  /** 送出前先確定這個模型能用參考圖、也知道怎麼上傳；不能時不呼叫撰寫者、不上傳 */
  function preflight(model: WorkflowModel) {
    if (!model.references) {
      throw new TempleBoardError(503, `${model.label} 的參考圖輸入方式還沒實測（07「下一輪測試」），不能用照片生成`);
    }
    if (!deps.workflows.upload) throw new TempleBoardError(503, new UploadNotConfiguredError().message);
    return model.references.max;
  }

  type BuildInput = {
    video: Video;
    view: { id: string; key: string; name: string; source: TempleView['source'] };
    ownPhotoIds: readonly string[];
    photos: readonly Photo[];
    versionId: string;
    locks: readonly string[];
    lighting: string;
    instruction: string | null;
    autoConfirm: boolean;
    uploaded: Map<string, string>;
  };

  /** 一個視角的生成請求：撰寫最終指令（檢查連續性鎖）→ 上傳參考圖 → 組出 MCP 呼叫 */
  async function buildRequest(generation: TempleBoardGeneration, input: BuildInput): Promise<Omit<GenerationRequest, 'consentToken'>> {
    const model = modelOf(input.video.imageModel);
    const max = preflight(model);
    const references = referencePhotos(input.photos, input.ownPhotoIds, max);
    const temple = findTemple(db, input.video.templeId);
    const series = findSeries(db, input.video.seriesId);
    const file = prompt();
    const variables = templeViewVariables({
      temple: { name: temple?.name ?? '', district: temple?.district ?? '', deity: temple?.deity ?? '' },
      series: { visualStyle: series?.visualStyle ?? '' },
      view: { key: input.view.key, name: input.view.name, source: input.view.source },
      references: references.map((photo) => ({ viewName: photo.viewKey ? viewName(photo.viewKey) : null })),
      appearanceLocks: input.locks,
      lighting: input.lighting,
      instruction: input.instruction,
    });
    const { request } = renderPrompt(file, variables, { model: input.video.imageModel });

    let composed;
    try {
      composed = await composeFinalPrompt({ request, locks: input.locks, writer: generation.writer });
    } catch (error: unknown) {
      throw new TempleBoardError(502, error instanceof Error ? error.message : '撰寫最終指令失敗');
    }

    const refs: string[] = [];
    try {
      for (const photo of references) {
        let ref = input.uploaded.get(photo.deidentifiedAssetId);
        if (!ref) {
          ref = (await generation.sendAsset(getCloudOkAsset(db, photo.deidentifiedAssetId))).remoteRef;
          input.uploaded.set(photo.deidentifiedAssetId, ref);
        }
        refs.push(ref);
      }
    } catch (error: unknown) {
      if (error instanceof UploadNotConfiguredError) throw new TempleBoardError(503, error.message);
      throw new TempleBoardError(502, error instanceof Error ? error.message : '上傳參考圖失敗');
    }

    let call: McpCall;
    try {
      const values = { output: { prompt: composed.prompt }, target: { aspectRatio: file.target.aspectRatio ?? '16:9' } };
      call = buildMcpCall({ modelKey: input.video.imageModel, config: deps.workflows, bindings: file.bindings ?? {}, values, seed: 0 });
      call = attachReferenceImages(call, model, refs);
    } catch (error: unknown) {
      if (error instanceof CallBuildError) throw new TempleBoardError(503, error.message);
      throw error;
    }

    const target: ViewTarget = { viewId: input.view.id, viewKey: input.view.key, boardVersionId: input.versionId, autoConfirm: input.autoConfirm };
    return {
      videoId: input.video.id,
      node: TEMPLE_VIEW_NODE,
      target,
      promptRef: { id: file.id, version: file.version },
      modelKey: input.video.imageModel,
      call,
      costItems: [{ model: input.video.imageModel, units: 1 }],
      input: { prompt: composed.prompt, notes: composed.notes ?? null, references: refs },
      userInstruction: input.instruction,
      outputKind: OUTPUT_KIND,
    };
  }

  function costItemsFor(video: Video, count: number): CostItem[] {
    return [{ model: video.imageModel, units: count }];
  }

  return {
    detail(videoId) {
      const video = findVideo(db, videoId);
      const version = video?.templeBoardVersionId ? findVersion(db, video.templeBoardVersionId) : null;
      return video && version ? toBoard(video, version) : null;
    },

    reusableFor(seriesId, templeId) {
      const board = findBoard(db, seriesId, templeId);
      const version = board?.currentVersionId ? findVersion(db, board.currentVersionId) : null;
      if (!version?.confirmedAt) return null;
      return { versionId: version.id, version: version.version, imageModel: version.imageModel, confirmedAt: version.confirmedAt };
    },

    async generate(videoId, rawInput) {
      const video = requireVideo(videoId);
      if (video.templeBoardVersionId) {
        throw new TempleBoardError(409, '這支影片已經產生寺廟定裝版，要修改請在定裝版頁重生單張');
      }
      const generation = requireGeneration();
      const input = generateTempleBoardSchema.parse(rawInput);
      const photos = listPhotosForVideo(db, video);
      if (photos.length === 0) throw new TempleBoardError(409, NO_PHOTO_MESSAGE);
      const planned = planBoardViews(photos, input.inferredViewKeys);
      if (planned.length === 0) throw new TempleBoardError(409, NO_VIEW_MESSAGE);

      const items = costItemsFor(video, planned.length);
      const precheck = generation.service.precheck(video.id, items, input.consentToken, planned.map(() => costItemsFor(video, 1)));
      if (!precheck.ok) return { status: 'consent_required', check: precheck.check };
      preflight(modelOf(video.imageModel));

      const existing = findBoard(db, video.seriesId, video.templeId);
      const boardId = existing?.id ?? clock.newId();
      const versionId = clock.newId();
      const lighting = DEFAULT_TEMPLE_LIGHTING;
      const uploaded = new Map<string, string>();
      const views = planned.map((view) => ({ ...view, id: clock.newId() }));
      const requests = [];
      for (const view of views) {
        requests.push(
          await buildRequest(generation, {
            video,
            view: { id: view.id, key: view.key, name: view.name, source: view.source },
            ownPhotoIds: view.photoIds,
            photos,
            versionId,
            locks: [],
            lighting,
            instruction: null,
            autoConfirm: view.source === 'photo',
            uploaded,
          }),
        );
      }

      // 視角列要在送出前建立：完成處理可能在送出回應前就到
      db.transaction((tx) => {
        if (!existing) insertBoard(tx, { id: boardId, seriesId: video.seriesId, templeId: video.templeId, currentVersionId: null });
        insertVersion(tx, {
          id: versionId,
          boardId,
          version: nextVersionNumber(tx, boardId),
          imageModel: video.imageModel,
          appearanceLocks: [],
          defaultLighting: lighting,
          confirmedAt: null,
        });
        insertViews(
          tx,
          views.map((view) => ({
            id: view.id,
            boardVersionId: versionId,
            viewKey: view.key,
            viewName: view.name,
            source: view.source,
            photoId: view.photoIds[0] ?? null,
            assetId: null,
            confirmed: false,
            createdFromVideoId: video.id,
          })),
        );
        tx.update(videos)
          .set({ modelsLockedAt: video.modelsLockedAt ?? nowIso(), stage: 'board_pending', templeBoardVersionId: versionId, updatedAt: nowIso() })
          .where(eq(videos.id, video.id))
          .run();
      });

      const outcome = await generation.service.submitBatch(requests, input.consentToken);
      if (outcome.status === 'consent_required') {
        // 檢查之後憑證失效（例如同時用了兩次）：收回剛建立的定裝版
        db.transaction((tx) => {
          tx.update(videos).set({ modelsLockedAt: video.modelsLockedAt, stage: video.stage, templeBoardVersionId: null }).where(eq(videos.id, video.id)).run();
          tx.delete(templeViews).where(eq(templeViews.boardVersionId, versionId)).run();
          tx.delete(templeBoardVersions).where(eq(templeBoardVersions.id, versionId)).run();
          if (!existing) tx.delete(templeBoards).where(eq(templeBoards.id, boardId)).run();
        });
        return { status: 'consent_required', check: outcome.check };
      }
      return { status: 'accepted', board: toBoard(requireVideo(video.id), findVersion(db, versionId) ?? never()) };
    },

    async regenerateView(videoId, viewKey, rawInput) {
      const { video, version } = editable(videoId);
      const row = listViews(db, version.id).find((view) => view.viewKey === viewKey);
      if (!row) throw new TempleBoardError(404, VIEW_NOT_FOUND);
      if (toView(row).state === 'generating') throw new TempleBoardError(409, `「${row.viewName}」還在生成中`);
      const generation = requireGeneration();
      const input = regenerateTempleViewSchema.parse(rawInput);

      const items = costItemsFor(video, 1);
      const precheck = generation.service.precheck(video.id, items, input.consentToken);
      if (!precheck.ok) return { status: 'consent_required', check: precheck.check };

      const photos = listPhotosForVideo(db, video);
      const own = photos.filter((photo) => photo.viewKey === viewKey).map((photo) => photo.id);
      const source: TempleView['source'] = own.length > 0 ? 'photo' : 'ai_inferred';
      const request = await buildRequest(generation, {
        video,
        view: { id: row.id, key: row.viewKey, name: row.viewName, source },
        ownPhotoIds: own,
        photos,
        versionId: version.id,
        locks: version.appearanceLocks,
        lighting: version.defaultLighting,
        instruction: input.instruction ? input.instruction : null,
        autoConfirm: false,
        uploaded: new Map(),
      });

      const previous = { source: row.source, photoId: row.photoId, confirmed: row.confirmed };
      updateView(db, row.id, { source, photoId: own[0] ?? null, confirmed: false });
      const outcome = await generation.service.submitBatch([request], input.consentToken);
      if (outcome.status === 'consent_required') {
        updateView(db, row.id, previous);
        return { status: 'consent_required', check: outcome.check };
      }
      return { status: 'accepted', board: toBoard(video, version) };
    },

    confirmView(videoId, viewKey) {
      const { video, version } = editable(videoId);
      const row = listViews(db, version.id).find((view) => view.viewKey === viewKey);
      if (!row) throw new TempleBoardError(404, VIEW_NOT_FOUND);
      const view = toView(row);
      if (view.state === 'generating') throw new TempleBoardError(409, `「${row.viewName}」還在生成中`);
      if (view.state === 'failed') throw new TempleBoardError(409, `「${row.viewName}」生成失敗，請重生`);
      updateView(db, row.id, { confirmed: true });
      return toBoard(video, version);
    },

    update(videoId, rawInput) {
      const { video, version } = editable(videoId);
      const input = updateTempleBoardSchema.parse(rawInput);
      updateVersion(db, version.id, input);
      return toBoard(video, findVersion(db, version.id) ?? version);
    },

    confirm(videoId) {
      const { video, version } = current(videoId);
      if (!version.confirmedAt) {
        const pending = boardPendingItems(listViews(db, version.id).map(toView));
        if (pending[0]) throw new TempleBoardError(409, pending[0]);
      }
      const confirmedAt = nowIso();
      db.transaction((tx) => {
        if (!version.confirmedAt) {
          updateVersion(tx, version.id, { confirmedAt });
          setCurrentVersion(tx, version.boardId, version.id);
        }
        if (!hasBoardConfirmation(tx, video.id, version.id)) {
          insertConfirmation(tx, { id: clock.newId(), videoId: video.id, versionId: version.id, confirmedAt });
        }
        if (video.stage === 'creating' || video.stage === 'board_pending') {
          tx.update(videos).set({ stage: 'chat', updatedAt: confirmedAt }).where(eq(videos.id, video.id)).run();
        }
      });
      const updated = requireVideo(video.id);
      return { board: toBoard(updated, findVersion(db, version.id) ?? version), video: updated };
    },

    reuse(videoId) {
      const video = requireVideo(videoId);
      if (video.templeBoardVersionId) throw new TempleBoardError(409, '這支影片已經有寺廟定裝版');
      const reusable = this.reusableFor(video.seriesId, video.templeId);
      if (!reusable) throw new TempleBoardError(409, '這間廟在這個系列還沒有確認過的寺廟定裝版');
      setVideo(video.id, { templeBoardVersionId: reusable.versionId, modelsLockedAt: video.modelsLockedAt ?? nowIso(), stage: 'board_pending' });
      return toBoard(requireVideo(video.id), findVersion(db, reusable.versionId) ?? never());
    },

    saveAsNewVersion(videoId) {
      const { video, version } = current(videoId);
      if (!version.confirmedAt) throw new TempleBoardError(409, '這個版本還沒確認，可以直接修改');
      const versionId = clock.newId();
      db.transaction((tx) => {
        insertVersion(tx, {
          id: versionId,
          boardId: version.boardId,
          version: nextVersionNumber(tx, version.boardId),
          imageModel: version.imageModel,
          appearanceLocks: [...version.appearanceLocks],
          defaultLighting: version.defaultLighting,
          confirmedAt: null,
        });
        insertViews(
          tx,
          listViews(tx, version.id).map((view) => ({ ...view, id: clock.newId(), boardVersionId: versionId })),
        );
        tx.update(videos).set({ templeBoardVersionId: versionId, updatedAt: nowIso() }).where(eq(videos.id, video.id)).run();
      });
      return toBoard(requireVideo(video.id), findVersion(db, versionId) ?? never());
    },

    async addSupplementalView() {
      throw new Error('尚未實作');
    },

    confirmSupplementalView() {
      throw new Error('尚未實作');
    },

    handleGenerated(generation, assetIds) {
      if (!isViewTarget(generation.target)) return;
      const view = findView(db, generation.target.viewId);
      const assetId = assetIds[0];
      if (!view || !assetId) return;
      updateView(db, view.id, { assetId, confirmed: generation.target.autoConfirm });
    },
  };
}

function never(): never {
  throw new TempleBoardError(404, BOARD_NOT_FOUND);
}
