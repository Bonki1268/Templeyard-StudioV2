import { UploadNotConfiguredError, type CloudAssetRef } from '@templeyard/comfy-client';
import { CallBuildError, attachReferenceImages, buildMcpCall, composeFinalPrompt, renderPrompt, type PromptWriter } from '@templeyard/prompts';
import {
  characterBlockers,
  checkPlan,
  generatingLabel,
  invalidatedBy,
  planRulesSchema,
  type CloudOkAsset,
  type CostCheck,
  type Frame,
  type FramesResponse,
  type InvalidationChange,
  type McpCall,
  type Plan,
  type PromptFile,
  type Shot,
  type ShotFrames,
  type Video,
  type WorkflowConfig,
  type WorkflowModel,
} from '@templeyard/shared';
import { eq } from 'drizzle-orm';
import { getCloudOkAsset } from '../assets/repository.js';
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
import { deleteFrames, findFrame, findGeneration, insertFrame, latestFrame, listFrames, updateFrame } from './repository.js';

// 精緻圖（F14）：依方案為每格產生首格（開啟中間關鍵畫格的格子另外產生末格），
// 參考角色定裝圖、定裝版視角圖與對應照片；生成中只顯示「生成中」，完成後逐格確認；修改時依失效規則標示需重新確認

export const REFINED_FRAME_NODE = 'refined-frame';

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
  handleGenerated: SucceededHandler;
};

type FrameTarget = { frameId: string; shotKey: string; kind: 'first' | 'last' };

function isFrameTarget(value: Record<string, unknown>): value is FrameTarget {
  return typeof value.frameId === 'string' && typeof value.shotKey === 'string';
}

const RUNNING: readonly GenerationRow['status'][] = ['awaiting_confirm', 'submitted', 'running'];

export function createFrameService(deps: {
  db: AppDatabase;
  clock: Clock;
  workflows: WorkflowConfig;
  prompts: ReadonlyMap<string, PromptFile>;
  plans: PlanService;
  characters: CharacterService;
  generation: FrameGeneration | null;
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
      const first = latestFrame(rows, shot.shotKey, 'first');
      const last = latestFrame(rows, shot.shotKey, 'last');
      return { shotKey: shot.shotKey, seq: shot.seq, first: first ? toFrame(first) : null, last: last ? toFrame(last) : null, needsLast: shot.keyframesEnabled };
    });
  }

  function get(videoId: string): FramesResponse {
    const video = requireVideo(videoId);
    const shots = shotsOf(videoId, deps.plans.current(videoId));
    const running = shots.flatMap((shot) => [shot.first, shot.last]).filter((frame): frame is Frame => frame?.state === 'generating');
    // 全部完成（成功或失敗）後離開「生成中」
    if (running.length === 0 && video.stage === 'frames_generating') setStage(videoId, 'frames');
    // 內容類型寫這一批送出的格數（同一批的精緻圖建立時間相同），不逐格顯示進度
    const batches = new Set(running.map((frame) => frame.createdAt));
    const batchShots = new Set(listFrames(db, videoId).filter((row) => batches.has(row.createdAt)).map((row) => row.shotKey));
    return { generating: running.length > 0, generatingLabel: running.length > 0 ? generatingLabel(batchShots.size) : null, shots };
  }

  function setStage(videoId: string, stage: Video['stage']) {
    db.update(videos).set({ stage, updatedAt: clock.now().toISOString() }).where(eq(videos.id, videoId)).run();
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

  type Built = { frameId: string; shotKey: string; kind: 'first' | 'last'; request: Omit<GenerationRequest, 'consentToken'> };

  /** 一張精緻圖的生成請求：撰寫最終指令（帶入角色與寺廟的連續性鎖）→ 上傳參考圖 → 組出 MCP 呼叫 */
  async function build(generation: FrameGeneration, video: Video, plan: Plan, shot: Shot, kind: 'first' | 'last', uploaded: Map<string, string>): Promise<Built> {
    const model = modelOf(video.imageModel);
    if (!model.references) throw new StudioError(503, `${model.label} 的參考圖輸入方式還沒實測（07「下一輪測試」），不能產生精緻圖`);
    if (!deps.workflows.upload) throw new StudioError(503, new UploadNotConfiguredError().message);
    const file = deps.prompts.get(REFINED_FRAME_NODE);
    if (!file) throw new Error(`找不到生成指令：${REFINED_FRAME_NODE}`);

    const cast = deps.characters.listForVideo(video.id).filter((c) => shot.characters.includes(c.name));
    const boardVersion = video.templeBoardVersionId ? findBoardVersion(db, video.templeBoardVersionId) : null;
    const view = boardVersion ? listViews(db, boardVersion.id).find((v) => v.viewKey === shot.viewKey) : undefined;
    const photo = shot.photoId ? findPhoto(db, shot.photoId) : null;

    // 參考圖：角色定裝圖 → 這一格的定裝版視角圖 → 對應照片的去識別圖
    const references: { label: string; assetId: string }[] = [
      ...cast.flatMap((c) => (c.version.lookAssetId ? [{ label: `角色「${c.name}」定裝圖`, assetId: c.version.lookAssetId }] : [])),
      ...(view?.assetId ? [{ label: `定裝版視角圖「${view.viewName}」`, assetId: view.assetId }] : []),
      ...(photo ? [{ label: '對應照片（去識別）', assetId: photo.deidentifiedAssetId }] : []),
    ].slice(0, model.references.max);

    const series = findSeries(db, video.seriesId);
    const characters = cast.map((c) => ({ name: c.name, continuityLocks: c.version.continuityLocks }));
    const appearanceLocks = boardVersion?.appearanceLocks ?? [];
    const variables = refinedFrameVariables({
      shot,
      role: kind,
      characters,
      viewName: view?.viewName ?? shot.viewKey,
      appearanceLocks,
      references: references.map((ref, index) => `Image ${index + 1}：${ref.label}`),
      seriesStyle: series?.visualStyle ?? '',
    });
    const { request } = renderPrompt(file, variables, { model: video.imageModel });
    let composed;
    try {
      composed = await composeFinalPrompt({ request, locks: frameLocks(characters, appearanceLocks), writer: generation.writer });
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
    const target: FrameTarget = { frameId, shotKey: shot.shotKey, kind };
    return {
      frameId,
      shotKey: shot.shotKey,
      kind,
      request: {
        videoId: video.id,
        node: REFINED_FRAME_NODE,
        target,
        promptRef: { id: file.id, version: file.version },
        modelKey: video.imageModel,
        call,
        costItems: [{ model: video.imageModel, units: 1 }],
        input: { prompt: composed.prompt, notes: composed.notes ?? null, references: refs, planVersion: plan.version },
        outputKind: 'frame',
      },
    };
  }

  /** 先寫入精緻圖（還沒有圖），送出；需要同意時把剛寫入的刪掉 */
  async function submit(generation: FrameGeneration, video: Video, plan: Plan, built: Built[], consentToken: string | null | undefined): Promise<FramesOutcome> {
    const now = clock.now().toISOString();
    const basedOn = {
      planVersion: plan.version,
      boardVersionId: video.templeBoardVersionId,
      characterVersionIds: deps.characters.listForVideo(video.id).map((c) => c.version.id),
    };
    for (const item of built) {
      insertFrame(db, {
        id: item.frameId,
        videoId: video.id,
        shotKey: item.shotKey,
        kind: item.kind,
        atSec: null,
        assetId: null,
        generationId: null,
        userUploaded: false,
        editOfFrameId: null,
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
    built.forEach((item, index) => updateFrame(db, item.frameId, { generationId: outcome.generationIds[index] ?? null }));
    setStage(video.id, 'frames_generating');
    return { status: 'accepted', frames: get(video.id) };
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

  return {
    get,

    async generate(videoId, consentToken) {
      const video = requireVideo(videoId);
      const plan = requirePlan(videoId);
      const detail = deps.plans.get(videoId);
      // 先說角色（要花錢產生定裝圖），再說方案的檢查
      const blockers = [
        ...characterBlockers(deps.characters.listForVideo(videoId).filter((c) => plan.shots.some((s) => s.characters.includes(c.name)))),
        ...checkPlan(plan.shots, planRulesSchema.parse(detail.rules)).blocking,
      ];
      if (blockers.length > 0) throw new StudioError(409, `還不能生成：${blockers[0]}`);
      if (get(videoId).generating) throw new StudioError(409, '精緻圖還在生成中');
      const generation = requireGeneration();
      const wanted = plan.shots.flatMap((shot) => (shot.keyframesEnabled ? [[shot, 'first'], [shot, 'last']] : [[shot, 'first']]) as [Shot, 'first' | 'last'][]);
      const items = [{ model: video.imageModel, units: wanted.length }];
      const precheck = generation.service.precheck(video.id, items, consentToken, wanted.map(() => [{ model: video.imageModel, units: 1 }]));
      if (!precheck.ok) return { status: 'consent_required', check: precheck.check };
      const uploaded = new Map<string, string>();
      const built: Built[] = [];
      for (const [shot, kind] of wanted) built.push(await build(generation, video, plan, shot, kind, uploaded));
      return submit(generation, video, plan, built, consentToken);
    },

    async regenerate(videoId, shotKey, kind, consentToken) {
      const video = requireVideo(videoId);
      const plan = deps.plans.current(videoId);
      const shot = requireShot(plan, shotKey);
      if (!plan) throw new StudioError(409, '還沒有分鏡方案');
      const generation = requireGeneration();
      const items = [{ model: video.imageModel, units: 1 }];
      const precheck = generation.service.precheck(video.id, items, consentToken);
      if (!precheck.ok) return { status: 'consent_required', check: precheck.check };
      const built = await build(generation, video, plan, shot, kind, new Map());
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
          const frame = latestFrame(rows, key, kind);
          if (frame) updateFrame(db, frame.id, { needsReconfirm: true });
        }
      }
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
