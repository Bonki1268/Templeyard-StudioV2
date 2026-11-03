import { UploadNotConfiguredError, type CloudAssetRef } from '@templeyard/comfy-client';
import { CallBuildError, attachReferenceImages, buildMcpCall, composeFinalPrompt, renderPrompt, type PromptWriter } from '@templeyard/prompts';
import {
  characterBlockers,
  checkPlan,
  generatingLabel,
  invalidatedBy,
  keyframeControlNote,
  keyframeTimesError,
  planRulesSchema,
  regionText,
  videoModelLabel,
  type CloudOkAsset,
  type CostCheck,
  type Frame,
  type FramesResponse,
  type InvalidationChange,
  type McpCall,
  type Plan,
  type PromptFile,
  type Shot,
  type ShotDetail,
  type ShotFrames,
  type regionEditSchema,
  type uploadFrameSchema,
  type Video,
  type WorkflowConfig,
  type WorkflowModel,
} from '@templeyard/shared';
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import { getCloudOkAsset } from '../assets/repository.js';
import type { AssetStore } from '../assets/store.js';
import { insertAsset } from '../assets/repository.js';
import type { CharacterService } from '../characters/service.js';
import type { AppDatabase } from '../db/client.js';
import { videos, type FrameRow, type GenerationRow } from '../db/schema.js';
import type { GenerationRequest, GenerationService, SucceededHandler } from '../generations/service.js';
import { findPhoto } from '../photos/repository.js';
import type { PlanService } from '../plans/service.js';
import { findSeries, type Clock } from '../series/repository.js';
import { StudioError, VIDEO_NOT_FOUND } from '../studio/errors.js';
import { findVersion as findBoardVersion, listViews } from '../templeBoards/repository.js';
import { findVideo } from '../videos/repository.js';
import { frameLocks, refinedFrameVariables } from './framePrompt.js';
import { deleteFrames, findFrame, findGeneration, insertFrame, listFrames, updateFrame } from './repository.js';

// 精緻圖（F14）：依方案為每格產生首格（開啟中間關鍵畫格的格子另外產生末格），
// 參考角色定裝圖、定裝版視角圖與對應照片；生成中只顯示「生成中」，完成後逐格確認；修改時依失效規則標示需重新確認

export const REFINED_FRAME_NODE = 'refined-frame';
export const KEYFRAME_NODE = 'keyframe';
export const REGION_EDIT_NODE = 'region-edit';
/** 精緻圖服務接手的生成節點 */
export const FRAME_NODES = [REFINED_FRAME_NODE, KEYFRAME_NODE, REGION_EDIT_NODE] as const;

export type FrameGeneration = {
  service: GenerationService;
  writer: PromptWriter;
  /** 型別上只收 cloud_ok 的資產 */
  sendAsset: (asset: CloudOkAsset) => Promise<CloudAssetRef>;
};

export type FramesOutcome = { status: 'consent_required'; check: CostCheck } | { status: 'accepted'; frames: FramesResponse };

export type FrameService = {
  /** 每格目前的精緻圖與生成狀態；影片不存在：StudioError 404 */
  get(videoId: string): FramesResponse;
  /**
   * 生成所有格的精緻圖：
   * - 方案檢查沒過或角色沒確認：409「還不能生成：<第一個原因>」
   * - 已經在生成：409「精緻圖還在生成中」
   * - 沒有同意憑證：consent_required；沒有設定生成服務：503
   * - 送出後影片進到 frames_generating，全部完成後進到 frames
   */
  generate(videoId: string, consentToken: string | null | undefined): Promise<FramesOutcome>;
  /** 單格重生：產生新的一張，要重新確認；方案沒有這一格：404「方案沒有這一格」 */
  regenerate(videoId: string, shotKey: string, kind: 'first' | 'last', consentToken: string | null | undefined): Promise<FramesOutcome>;
  /** 確認這一格（首格，需要時加末格）；還沒產生完成：409「第 N 格的精緻圖還沒產生完成」 */
  confirm(videoId: string, shotKey: string): FramesResponse;
  /** 依失效規則把受影響的精緻圖標示需重新確認 */
  invalidate(videoId: string, change: InvalidationChange): void;
  /** 細修頁（第 10 階段）：這一格的卡片、目前的首格／末格／關鍵畫格、所有版本、最近一次的生成指令 */
  detail(videoId: string, shotKey: string): ShotDetail;
  /** 上傳自己的圖（瀏覽器已去識別）作為首格或末格，成為這一格目前的圖 */
  upload(videoId: string, shotKey: string, input: z.output<typeof uploadFrameSchema>): ShotDetail;
  /** 選回這一格的某一張圖；不是這一格的圖：StudioError 404「找不到這張精緻圖」 */
  select(videoId: string, shotKey: string, frameId: string): ShotDetail;
  /** 產生中間關鍵畫格（還沒有末格時一併產生）；沒有開啟或時間點不符規則：StudioError 409 */
  generateKeyframes(videoId: string, shotKey: string, consentToken: string | null | undefined): Promise<FramesOutcome>;
  /** 限定範圍修改：以這張圖為參考，只改圈選的一處，產生新的一張（記下修改自哪一張） */
  editRegion(videoId: string, shotKey: string, frameId: string, input: z.output<typeof regionEditSchema>): Promise<FramesOutcome>;
  handleGenerated: SucceededHandler;
};

type FrameTarget = { frameId: string; shotKey: string; kind: FrameRow['kind'] };

function isFrameTarget(value: Record<string, unknown>): value is FrameTarget {
  return typeof value.frameId === 'string' && typeof value.shotKey === 'string';
}

const RUNNING: readonly GenerationRow['status'][] = ['awaiting_confirm', 'submitted', 'running'];

/** 一張要產生的圖：首格／末格（refined-frame）、關鍵畫格（keyframe）、限定範圍修改（region-edit） */
type Job =
  | { node: typeof REFINED_FRAME_NODE; kind: 'first' | 'last' }
  | { node: typeof KEYFRAME_NODE; kind: 'keyframe'; atSec: number }
  | { node: typeof REGION_EDIT_NODE; kind: 'first' | 'last'; source: FrameRow; box: z.output<typeof regionEditSchema>['box']; instruction: string };

/** 這一格這一種圖目前用的那一張：使用者選定的；沒有選定時是最新的 */
function currentFrame(rows: readonly FrameRow[], shotKey: string, kind: FrameRow['kind'], atSec: number | null = null): FrameRow | null {
  const candidates = rows.filter((row) => row.shotKey === shotKey && row.kind === kind && (atSec === null || row.atSec === atSec));
  return [...candidates].reverse().find((row) => row.selected) ?? candidates.at(-1) ?? null;
}

export function createFrameService(deps: {
  db: AppDatabase;
  clock: Clock;
  workflows: WorkflowConfig;
  prompts: ReadonlyMap<string, PromptFile>;
  plans: PlanService;
  characters: CharacterService;
  generation: FrameGeneration | null;
  /** 使用者上傳的首格存在這裡；沒有時交給生成服務存 */
  store?: AssetStore;
  /**
   * 精緻圖有變動時通知（第 11 階段）：失效規則套用到精緻圖之後轉給影片服務；
   * 這一格的首格換了（重生、上傳、選回、限定範圍修改完成）時送出 { type: 'firstFrame' }
   */
  onChange?: (videoId: string, change: InvalidationChange) => void;
  /** 這一格目前的影片（細修頁的偏差比對；第 11 階段） */
  clipOf?: (videoId: string, shotKey: string) => ShotDetail['clip'];
  unavailableMessage?: string;
}): FrameService {
  const { db, clock } = deps;

  function requireVideo(videoId: string): Video {
    const video = findVideo(db, videoId);
    if (!video) throw new StudioError(404, VIDEO_NOT_FOUND);
    return video;
  }

  function toFrame(row: FrameRow): Frame {
    const generation = row.generationId ? findGeneration(db, row.generationId) : null;
    let state: Frame['state'] = 'ready';
    let error: string | null = null;
    if (generation && RUNNING.includes(generation.status)) state = 'generating';
    else if (generation && (generation.status === 'failed' || generation.status === 'timeout')) {
      state = 'failed';
      error = generation.error;
    } else if (!row.assetId) state = 'generating';
    return {
      id: row.id,
      shotKey: row.shotKey,
      kind: row.kind,
      atSec: row.atSec,
      assetId: row.assetId,
      state,
      error,
      selected: row.selected,
      needsReconfirm: row.needsReconfirm,
      createdAt: row.createdAt,
    };
  }

  function shotsOf(videoId: string, plan: Plan | null): ShotFrames[] {
    if (!plan) return [];
    const rows = listFrames(db, videoId);
    return plan.shots.map((shot) => {
      const first = currentFrame(rows, shot.shotKey, 'first');
      const last = currentFrame(rows, shot.shotKey, 'last');
      return { shotKey: shot.shotKey, seq: shot.seq, first: first ? toFrame(first) : null, last: last ? toFrame(last) : null, needsLast: shot.keyframesEnabled };
    });
  }

  function setStage(videoId: string, stage: Video['stage']) {
    db.update(videos).set({ stage, updatedAt: clock.now().toISOString() }).where(eq(videos.id, videoId)).run();
  }

  function get(videoId: string): FramesResponse {
    const video = requireVideo(videoId);
    const shots = shotsOf(videoId, deps.plans.current(videoId));
    const running = listFrames(db, videoId).map(toFrame).filter((frame) => frame.state === 'generating');
    // 全部完成（成功或失敗）後離開「生成中」
    if (running.length === 0 && video.stage === 'frames_generating') setStage(videoId, 'frames');
    // 內容類型寫這一批送出的格數（同一批的圖建立時間相同），不逐格顯示進度
    const batches = new Set(running.map((frame) => frame.createdAt));
    const batchShots = new Set(listFrames(db, videoId).filter((row) => batches.has(row.createdAt)).map((row) => row.shotKey));
    return { generating: running.length > 0, generatingLabel: running.length > 0 ? generatingLabel(batchShots.size) : null, shots };
  }

  function requireGeneration(): FrameGeneration {
    if (!deps.generation) throw new StudioError(503, deps.unavailableMessage ?? '還沒設定生成服務');
    return deps.generation;
  }

  function modelOf(key: string): WorkflowModel {
    const model = deps.workflows.models[key];
    if (!model) throw new StudioError(503, `workflows 設定沒有「${key}」`);
    return model;
  }

  function requirePlan(videoId: string): Plan {
    const plan = deps.plans.current(videoId);
    if (!plan) throw new StudioError(409, '還沒有分鏡方案');
    return plan;
  }

  function requireShot(plan: Plan | null, shotKey: string): Shot {
    const shot = plan?.shots.find((s) => s.shotKey === shotKey);
    if (!shot) throw new StudioError(404, '方案沒有這一格');
    return shot;
  }

  type Built = { frameId: string; shotKey: string; kind: FrameRow['kind']; atSec: number | null; editOfFrameId: string | null; request: Omit<GenerationRequest, 'consentToken'> };

  /** 一張圖的生成請求：撰寫最終指令（帶入角色與寺廟的連續性鎖；這一格有自訂指令時照它）→ 上傳參考圖 → 組出 MCP 呼叫 */
  async function build(generation: FrameGeneration, video: Video, plan: Plan, shot: Shot, job: Job, uploaded: Map<string, string>): Promise<Built> {
    const model = modelOf(video.imageModel);
    if (!model.references) throw new StudioError(503, `${model.label} 的參考圖輸入方式還沒實測（07「下一輪測試」），不能產生精緻圖`);
    if (!deps.workflows.upload) throw new StudioError(503, new UploadNotConfiguredError().message);
    const file = deps.prompts.get(job.node);
    if (!file) throw new Error(`找不到生成指令：${job.node}`);

    const cast = deps.characters.listForVideo(video.id).filter((c) => shot.characters.includes(c.name));
    const boardVersion = video.templeBoardVersionId ? findBoardVersion(db, video.templeBoardVersionId) : null;
    const view = boardVersion ? listViews(db, boardVersion.id).find((v) => v.viewKey === shot.viewKey) : undefined;
    const photo = shot.photoId ? findPhoto(db, shot.photoId) : null;

    // 參考圖：限定範圍修改先放要修改的原圖；接著角色定裝圖 → 定裝版視角圖 → 對應照片的去識別圖
    const references: { label: string; assetId: string }[] = [
      ...(job.node === REGION_EDIT_NODE && job.source.assetId ? [{ label: '要修改的原圖', assetId: job.source.assetId }] : []),
      ...cast.flatMap((c) => (c.version.lookAssetId ? [{ label: `角色「${c.name}」定裝圖`, assetId: c.version.lookAssetId }] : [])),
      ...(view?.assetId ? [{ label: `定裝版視角圖「${view.viewName}」`, assetId: view.assetId }] : []),
      ...(photo ? [{ label: '對應照片（去識別）', assetId: photo.deidentifiedAssetId }] : []),
    ].slice(0, model.references.max);

    const series = findSeries(db, video.seriesId);
    const characters = cast.map((c) => ({ name: c.name, continuityLocks: c.version.continuityLocks }));
    const appearanceLocks = boardVersion?.appearanceLocks ?? [];
    const locks = frameLocks(characters, appearanceLocks);
    const referenceText = references.map((ref, index) => `Image ${index + 1}：${ref.label}`);
    let variables: Record<string, unknown>;
    if (job.node === REFINED_FRAME_NODE) {
      variables = refinedFrameVariables({
        shot,
        role: job.kind,
        characters,
        viewName: view?.viewName ?? shot.viewKey,
        appearanceLocks,
        references: referenceText,
        seriesStyle: series?.visualStyle ?? '',
      });
    } else if (job.node === KEYFRAME_NODE) {
      variables = {
        shot: {
          seq: shot.seq,
          durationSec: shot.durationSec,
          description: shot.description,
          actionStart: shot.actionStart,
          actionEnd: shot.actionEnd || shot.actionStart,
          shotSize: shot.shotSize,
          cameraMove: shot.cameraMove,
          cameraAngle: shot.cameraAngle,
          characters: characters.map((c) => c.name).join('、'),
          lighting: shot.lighting,
        },
        keyframe: { time: String(job.atSec), state: `從「${shot.actionStart}」到「${shot.actionEnd || shot.actionStart}」之間，第 ${job.atSec} 秒的瞬間` },
        character: { locks: locks.filter((lock) => !appearanceLocks.includes(lock)).join('; ') },
        view: { name: view?.viewName ?? shot.viewKey },
        temple: { appearanceLocks: appearanceLocks.join('; ') },
        references: referenceText.join('；'),
        instruction: '',
      };
    } else {
      variables = {
        image: { reference: referenceText[0] ?? 'Image 1：要修改的原圖' },
        region: regionText(job.box),
        change: job.instruction,
        preserve: '圈選範圍以外的畫面全部照原圖保留',
        character: { locks: locks.filter((lock) => !appearanceLocks.includes(lock)).join('; ') },
        temple: { appearanceLocks: appearanceLocks.join('; ') },
        instruction: job.instruction,
      };
    }
    const { request } = renderPrompt(file, variables, { model: video.imageModel });
    let composed;
    try {
      // 自訂指令只用在這一格的首格與末格（細修頁「進階：生成指令」），節點的生成指令更新也不會覆蓋
      const customPrompt = job.node === REFINED_FRAME_NODE ? shot.customPrompt : null;
      composed = await composeFinalPrompt({ request, locks, writer: generation.writer, customPrompt });
    } catch (error: unknown) {
      throw new StudioError(502, error instanceof Error ? error.message : '撰寫最終指令失敗');
    }

    const refs: string[] = [];
    try {
      for (const ref of references) {
        let remote = uploaded.get(ref.assetId);
        if (!remote) {
          remote = (await generation.sendAsset(getCloudOkAsset(db, ref.assetId))).remoteRef;
          uploaded.set(ref.assetId, remote);
        }
        refs.push(remote);
      }
    } catch (error: unknown) {
      if (error instanceof UploadNotConfiguredError) throw new StudioError(503, error.message);
      throw new StudioError(502, error instanceof Error ? error.message : '上傳參考圖失敗');
    }

    let call: McpCall;
    try {
      const values = { output: { prompt: composed.prompt }, target: { aspectRatio: file.target.aspectRatio ?? '16:9' } };
      call = attachReferenceImages(buildMcpCall({ modelKey: video.imageModel, config: deps.workflows, bindings: file.bindings ?? {}, values, seed: 0 }), model, refs);
    } catch (error: unknown) {
      if (error instanceof CallBuildError) throw new StudioError(503, error.message);
      throw error;
    }
    const frameId = clock.newId();
    const target: FrameTarget = { frameId, shotKey: shot.shotKey, kind: job.kind };
    return {
      frameId,
      shotKey: shot.shotKey,
      kind: job.kind,
      atSec: job.node === KEYFRAME_NODE ? job.atSec : null,
      editOfFrameId: job.node === REGION_EDIT_NODE ? job.source.id : null,
      request: {
        videoId: video.id,
        node: job.node,
        target,
        promptRef: { id: file.id, version: file.version },
        modelKey: video.imageModel,
        call,
        costItems: [{ model: video.imageModel, units: 1 }],
        input: { prompt: composed.prompt, notes: composed.notes ?? null, references: refs, planVersion: plan.version, promptSource: composed.source },
        outputKind: 'frame',
      },
    };
  }

  /** 同一格同一種圖：新的一張成為目前的（清掉舊的選定） */
  function clearSelection(videoId: string, shotKey: string, kind: FrameRow['kind'], atSec: number | null, except?: string) {
    for (const row of listFrames(db, videoId)) {
      if (row.id === except) continue;
      if (row.shotKey === shotKey && row.kind === kind && (kind !== 'keyframe' || row.atSec === atSec) && row.selected) updateFrame(db, row.id, { selected: false });
    }
  }

  /** 先寫入精緻圖（還沒有圖），送出；需要同意時把剛寫入的刪掉 */
  async function submit(generation: FrameGeneration, video: Video, plan: Plan, built: Built[], consentToken: string | null | undefined): Promise<FramesOutcome> {
    const now = clock.now().toISOString();
    const basedOn = {
      planVersion: plan.version,
      boardVersionId: video.templeBoardVersionId,
      characterVersionIds: deps.characters.listForVideo(video.id).map((c) => c.version.id),
    };
    // 先寫入（還沒有圖），生成完成時才接得上；需要同意時刪掉
    for (const item of built) {
      insertFrame(db, {
        id: item.frameId,
        videoId: video.id,
        shotKey: item.shotKey,
        kind: item.kind,
        atSec: item.atSec,
        assetId: null,
        generationId: null,
        userUploaded: false,
        editOfFrameId: item.editOfFrameId,
        selected: false,
        basedOn,
        needsReconfirm: false,
        createdAt: now,
      });
    }
    const outcome = await generation.service.submitBatch(
      built.map((item) => item.request),
      consentToken,
    );
    if (outcome.status === 'consent_required') {
      deleteFrames(db, built.map((item) => item.frameId));
      return { status: 'consent_required', check: outcome.check };
    }
    built.forEach((item, index) => {
      // 新的一張成為目前的：清掉同一格同一種圖舊的選定
      clearSelection(video.id, item.shotKey, item.kind, item.atSec, item.frameId);
      updateFrame(db, item.frameId, { generationId: outcome.generationIds[index] ?? null });
    });
    setStage(video.id, 'frames_generating');
    return { status: 'accepted', frames: get(video.id) };
  }

  function precheck(generation: FrameGeneration, video: Video, units: number, consentToken: string | null | undefined) {
    const items = [{ model: video.imageModel, units }];
    return generation.service.precheck(video.id, items, consentToken, Array.from({ length: units }, () => [{ model: video.imageModel, units: 1 }]));
  }

  function detail(videoId: string, shotKey: string): ShotDetail {
    const video = requireVideo(videoId);
    const plan = deps.plans.current(videoId);
    const shot = requireShot(plan, shotKey);
    const rows = listFrames(db, videoId).filter((row) => row.shotKey === shotKey);
    const first = currentFrame(rows, shotKey, 'first');
    const last = currentFrame(rows, shotKey, 'last');
    const keyframes = shot.keyframeTimes.flatMap((t) => {
      const row = currentFrame(rows, shotKey, 'keyframe', t);
      return row ? [toFrame(row)] : [];
    });
    const lastGenerated = [...rows].reverse().find((row) => row.generationId);
    const lastPrompt = lastGenerated?.generationId ? findGeneration(db, lastGenerated.generationId)?.input.prompt : undefined;
    const rules = planRulesSchema.parse(deps.plans.get(videoId).rules);
    return {
      shot,
      first: first ? toFrame(first) : null,
      last: last ? toFrame(last) : null,
      keyframes,
      versions: rows.map((row) => ({ ...toFrame(row), editOfFrameId: row.editOfFrameId, userUploaded: row.userUploaded })),
      lastPrompt: typeof lastPrompt === 'string' ? lastPrompt : null,
      keyframeControl: keyframeControlNote(video.videoModel, videoModelLabel(video.videoModel)),
      totalSec: plan?.shots.reduce((sum, s) => sum + s.durationSec, 0) ?? 0,
      targetSec: rules.targetSec,
      clip: null,
    };
  }

  return {
    get,

    async generate(videoId, consentToken) {
      const video = requireVideo(videoId);
      const plan = requirePlan(videoId);
      const rules = planRulesSchema.parse(deps.plans.get(videoId).rules);
      // 先說角色（要花錢產生定裝圖），再說方案的檢查
      const blockers = [
        ...characterBlockers(deps.characters.listForVideo(videoId).filter((c) => plan.shots.some((s) => s.characters.includes(c.name)))),
        ...checkPlan(plan.shots, rules).blocking,
      ];
      if (blockers.length > 0) throw new StudioError(409, `還不能生成：${blockers[0]}`);
      if (get(videoId).generating) throw new StudioError(409, '精緻圖還在生成中');
      const generation = requireGeneration();
      const wanted = plan.shots.flatMap((shot) => (shot.keyframesEnabled ? [[shot, 'first'], [shot, 'last']] : [[shot, 'first']]) as [Shot, 'first' | 'last'][]);
      const check = precheck(generation, video, wanted.length, consentToken);
      if (!check.ok) return { status: 'consent_required', check: check.check };
      const uploaded = new Map<string, string>();
      const built: Built[] = [];
      for (const [shot, kind] of wanted) built.push(await build(generation, video, plan, shot, { node: REFINED_FRAME_NODE, kind }, uploaded));
      return submit(generation, video, plan, built, consentToken);
    },

    async regenerate(videoId, shotKey, kind, consentToken) {
      const video = requireVideo(videoId);
      const plan = deps.plans.current(videoId);
      const shot = requireShot(plan, shotKey);
      if (!plan) throw new StudioError(409, '還沒有分鏡方案');
      // 同一格還在生成中：不重複送出，也不重複付費
      const running = currentFrame(listFrames(db, videoId), shotKey, kind);
      if (running && toFrame(running).state === 'generating') throw new StudioError(409, `第 ${shot.seq} 格的精緻圖還在生成中`);
      const generation = requireGeneration();
      const check = precheck(generation, video, 1, consentToken);
      if (!check.ok) return { status: 'consent_required', check: check.check };
      const built = await build(generation, video, plan, shot, { node: REFINED_FRAME_NODE, kind }, new Map());
      return submit(generation, video, plan, [built], consentToken);
    },

    confirm(videoId, shotKey) {
      requireVideo(videoId);
      const plan = deps.plans.current(videoId);
      const shot = requireShot(plan, shotKey);
      const current = shotsOf(videoId, plan).find((s) => s.shotKey === shotKey);
      const parts = shot.keyframesEnabled ? [current?.first, current?.last] : [current?.first];
      if (parts.some((frame) => !frame || frame.state !== 'ready')) throw new StudioError(409, `第 ${shot.seq} 格的精緻圖還沒產生完成`);
      for (const frame of parts) if (frame) updateFrame(db, frame.id, { selected: true, needsReconfirm: false });
      return get(videoId);
    },

    invalidate(videoId, change) {
      const plan = deps.plans.current(videoId);
      if (!plan) return;
      const { frames: keys } = invalidatedBy(change, plan.shots);
      const rows = listFrames(db, videoId);
      for (const key of keys) {
        for (const kind of ['first', 'last'] as const) {
          const frame = currentFrame(rows, key, kind);
          if (frame) updateFrame(db, frame.id, { needsReconfirm: true });
        }
      }
    },

    detail,

    upload(videoId, shotKey, input) {
      const video = requireVideo(videoId);
      requireShot(deps.plans.current(videoId), shotKey);
      const bytes = new Uint8Array(Buffer.from(input.dataBase64, 'base64'));
      let assetId: string;
      if (deps.store) {
        const id = clock.newId();
        const saved = deps.store.save({ id, kind: 'frame', mime: input.mime, bytes });
        assetId = insertAsset(db, { id, kind: 'frame', mime: input.mime, path: saved.path, sha256: saved.sha256 }).id;
      } else {
        assetId = requireGeneration().service.saveAsset({ kind: 'frame', mime: input.mime, bytes }).id;
      }
      clearSelection(video.id, shotKey, input.kind, null);
      insertFrame(db, {
        id: clock.newId(),
        videoId: video.id,
        shotKey,
        kind: input.kind,
        atSec: null,
        assetId,
        generationId: null,
        userUploaded: true,
        editOfFrameId: null,
        selected: false,
        basedOn: { uploaded: true },
        needsReconfirm: false,
        createdAt: clock.now().toISOString(),
      });
      return detail(videoId, shotKey);
    },

    select(videoId, shotKey, frameId) {
      requireVideo(videoId);
      requireShot(deps.plans.current(videoId), shotKey);
      const row = findFrame(db, frameId);
      if (!row || row.videoId !== videoId || row.shotKey !== shotKey) throw new StudioError(404, '找不到這張精緻圖');
      if (toFrame(row).state !== 'ready') throw new StudioError(409, '這張圖還沒產生完成');
      clearSelection(videoId, shotKey, row.kind, row.atSec);
      updateFrame(db, row.id, { selected: true, needsReconfirm: false });
      return detail(videoId, shotKey);
    },

    async generateKeyframes(videoId, shotKey, consentToken) {
      const video = requireVideo(videoId);
      const plan = deps.plans.current(videoId);
      const shot = requireShot(plan, shotKey);
      if (!plan) throw new StudioError(409, '還沒有分鏡方案');
      if (!shot.keyframesEnabled) throw new StudioError(409, '這一格還沒開啟中間關鍵畫格');
      const error = keyframeTimesError(shot.keyframeTimes, shot.durationSec);
      if (error) throw new StudioError(409, error);
      const generation = requireGeneration();
      const needLast = !currentFrame(listFrames(db, videoId), shotKey, 'last');
      const jobs: Job[] = [
        ...shot.keyframeTimes.map((atSec): Job => ({ node: KEYFRAME_NODE, kind: 'keyframe', atSec })),
        ...(needLast ? [{ node: REFINED_FRAME_NODE, kind: 'last' } as Job] : []),
      ];
      const check = precheck(generation, video, jobs.length, consentToken);
      if (!check.ok) return { status: 'consent_required', check: check.check };
      const uploaded = new Map<string, string>();
      const built: Built[] = [];
      for (const job of jobs) built.push(await build(generation, video, plan, shot, job, uploaded));
      return submit(generation, video, plan, built, consentToken);
    },

    async editRegion(videoId, shotKey, frameId, input) {
      const video = requireVideo(videoId);
      const plan = deps.plans.current(videoId);
      const shot = requireShot(plan, shotKey);
      if (!plan) throw new StudioError(409, '還沒有分鏡方案');
      const source = findFrame(db, frameId);
      if (!source || source.videoId !== videoId || source.shotKey !== shotKey || source.kind === 'keyframe') throw new StudioError(404, '找不到這張精緻圖');
      if (!source.assetId) throw new StudioError(409, '這張圖還沒產生完成');
      const generation = requireGeneration();
      const check = precheck(generation, video, 1, input.consentToken);
      if (!check.ok) return { status: 'consent_required', check: check.check };
      const kind = source.kind === 'last' ? 'last' : 'first';
      const built = await build(generation, video, plan, shot, { node: REGION_EDIT_NODE, kind, source, box: input.box, instruction: input.instruction }, new Map());
      return submit(generation, video, plan, [built], input.consentToken);
    },

    handleGenerated(generation, assetIds) {
      if (!isFrameTarget(generation.target)) return;
      const assetId = assetIds[0];
      if (!assetId) return;
      updateFrame(db, generation.target.frameId, { assetId });
      const frame = findFrame(db, generation.target.frameId);
      if (frame) get(frame.videoId);
    },
  };
}
