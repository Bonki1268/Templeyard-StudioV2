import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { UploadNotConfiguredError } from '@templeyard/comfy-client';
import { CallBuildError, attachReferenceImages, buildMcpCall, composeFinalPrompt, renderPrompt } from '@templeyard/prompts';
import {
  assDialogues,
  buildAss,
  clipBlockers,
  FINAL_STALE_MESSAGE,
  NO_FINAL_MESSAGE,
  clipGeneratingLabel,
  downloadFileName,
  generatedClipSec,
  grayscaleSimilarity,
  invalidatedBy,
  keyframeTimeline,
  subtitleEvents,
  type Clip,
  type ClipsResponse,
  type CostCheck,
  type CostItem,
  type Final,
  type InvalidationChange,
  type McpCall,
  type Plan,
  type PromptFile,
  type Shot,
  type Video,
  type WorkflowConfig,
  type WorkflowModel,
} from '@templeyard/shared';
import { and, eq } from 'drizzle-orm';
import { findAsset, getCloudOkAsset, insertAsset } from '../assets/repository.js';
import type { AssetStore } from '../assets/store.js';
import type { ReferenceSheets } from '../references/sheet.js';
import type { CharacterService } from '../characters/service.js';
import { FINAL_SPEC, type Ffmpeg } from '../compose/ffmpeg.js';
import type { AppDatabase } from '../db/client.js';
import { generations, videos, type ClipRow, type FinalRow, type GenerationRow } from '../db/schema.js';
import { frameLocks } from '../frames/framePrompt.js';
import { findGeneration } from '../frames/repository.js';
import type { FrameGeneration, FrameService } from '../frames/service.js';
import type { GenerationRequest, SucceededHandler } from '../generations/service.js';
import type { PlanService } from '../plans/service.js';
import type { Clock } from '../series/repository.js';
import { seriesSettingsForVideo } from '../series/settings.js';
import { StudioError, VIDEO_NOT_FOUND } from '../studio/errors.js';
import { findVersion as findBoardVersion, listViews } from '../templeBoards/repository.js';
import { fitReferences } from '../references/sheet.js';
import { findTemple } from '../temples/repository.js';
import { findVideo } from '../videos/repository.js';
import { deleteClips, findClip, insertClip, insertFinal, latestFinal, listClips, updateClip } from './repository.js';

// 分鏡影片與成品（F15）：每格以確認的精緻圖為首格（需要時含末格與中間關鍵畫格）生成影片，
// 背景音樂另外生成（ACE-Step）；全部完成後在本機用 FFmpeg 合成成品（不花錢）

export const SHOT_VIDEO_NODE = 'shot-video';
/** 背景音樂的生成節點（沒有生成指令檔，曲風寫在 workflows 設定） */
export const MUSIC_NODE = 'background-music';
/** 影片服務接手的生成節點 */
export const CLIP_NODES = [SHOT_VIDEO_NODE, MUSIC_NODE] as const;

/** 偏差比對時擷取畫面的大小 */
export const SIMILARITY_SIZE = { width: 64, height: 36 } as const;

export type ClipsOutcome = { status: 'consent_required'; check: CostCheck } | { status: 'accepted'; clips: ClipsResponse };

export type ClipService = {
  /** 每格目前的影片、成品與生成狀態；影片不存在：StudioError 404 */
  get(videoId: string): ClipsResponse;
  /**
   * 生成影片：
   * - 精緻圖還沒全部確認：409「還不能生成影片：<第一個原因>」
   * - 已經在生成或合成：409「影片還在生成中」
   * - 沒有同意憑證：consent_required；沒有設定生成服務、模型的首格輸入方式還沒實測：503
   * - 只生成還沒有可用影片的格子（沒有、失敗或需重新確認）；背景音樂還沒有時一併生成
   * - 送出後影片進到 video_generating；全部完成後合成成品，進到 final
   */
  generate(videoId: string, consentToken: string | null | undefined): Promise<ClipsOutcome>;
  /** 依失效規則把受影響的影片標示需重新確認（成品跟著需重新確認） */
  invalidate(videoId: string, change: InvalidationChange): void;
  /** 這一格目前的影片（細修頁的偏差比對） */
  clipOf(videoId: string, shotKey: string): Clip | null;
  /** 等目前的合成結束（測試與重新啟動後使用） */
  whenComposed(videoId: string): Promise<void>;
  /**
   * 對話修改成品（第 12 階段）：把這幾格的影片標示需重新確認，記下調整指令；之後按「重生並重新合成」才花錢。
   * 還沒有成品：StudioError 409「還沒有成品」；方案沒有這一格：404「方案沒有第 N 格」
   */
  scheduleRevision(videoId: string, seqs: readonly number[], instruction: string): ClipsResponse;
  /** 確認成品，影片階段變為 done；沒有成品 409「還沒有成品」；需重新確認 409「成品需重新確認，請重新生成影片」 */
  confirmFinal(videoId: string): ClipsResponse;
  /** 下載用：成品檔案的絕對路徑與檔名；沒有成品 StudioError 404「還沒有成品」 */
  finalFile(videoId: string): { path: string; filename: string };
  handleGenerated: SucceededHandler;
};

export function createClipService(deps: {
  db: AppDatabase;
  clock: Clock;
  workflows: WorkflowConfig;
  prompts: ReadonlyMap<string, PromptFile>;
  plans: PlanService;
  characters: CharacterService;
  frames: FrameService;
  generation: FrameGeneration | null;
  store: AssetStore;
  ffmpeg: Ffmpeg;
  /** 參考圖拼接（Gemini 參考圖範本的 @Image2 是一張拼接圖） */
  sheets?: ReferenceSheets;
  unavailableMessage?: string;
}): ClipService {
  const { db, clock } = deps;
  /** 每支影片的背景工作（偏差比對、合成）依序執行；pending 是還沒做完的數量 */
  const work = new Map<string, Promise<void>>();
  const pending = new Map<string, number>();
  const composeErrors = new Map<string, string>();

  function requireVideo(videoId: string): Video {
    const video = findVideo(db, videoId);
    if (!video) throw new StudioError(404, VIDEO_NOT_FOUND);
    return video;
  }

  function setStage(videoId: string, stage: Video['stage']) {
    db.update(videos).set({ stage, updatedAt: clock.now().toISOString() }).where(eq(videos.id, videoId)).run();
  }

  function stateOf(generation: GenerationRow | null, assetId: string | null): { state: Clip['state']; error: string | null } {
    if (generation && RUNNING.includes(generation.status)) return { state: 'generating', error: null };
    if (generation && (generation.status === 'failed' || generation.status === 'timeout')) return { state: 'failed', error: generation.error };
    return assetId ? { state: 'ready', error: null } : { state: 'generating', error: null };
  }

  function toClip(row: ClipRow): Clip {
    const generation = row.generationId ? findGeneration(db, row.generationId) : null;
    return {
      id: row.id,
      shotKey: row.shotKey,
      assetId: row.assetId,
      ...stateOf(generation, row.assetId),
      selected: row.selected,
      needsReconfirm: row.needsReconfirm,
      similarity: row.keyframeSimilarity,
      revision: revisionOf(row),
      createdAt: row.createdAt,
    };
  }

  /** 這一格目前的影片：最新的那一支 */
  function currentRow(rows: readonly ClipRow[], shotKey: string): ClipRow | null {
    return rows.filter((row) => row.shotKey === shotKey).at(-1) ?? null;
  }

  function musicGenerations(videoId: string): GenerationRow[] {
    return db
      .select()
      .from(generations)
      .where(and(eq(generations.videoId, videoId), eq(generations.node, MUSIC_NODE)))
      .all();
  }

  /** 已經生成好的背景音樂（最新一首） */
  function readyMusic(videoId: string): string | null {
    const done = musicGenerations(videoId).filter((g) => g.status === 'succeeded' && typeof g.target.assetId === 'string');
    const last = done.at(-1);
    return last ? String(last.target.assetId) : null;
  }

  function musicRunning(videoId: string): boolean {
    return musicGenerations(videoId).some((g) => RUNNING.includes(g.status));
  }

  function toFinal(row: FinalRow, currentIds: readonly (string | null)[], stale: boolean): Final {
    const asset = findAsset(db, row.assetId);
    const subtitle = row.subtitleAssetId ? findAsset(db, row.subtitleAssetId) : null;
    const subtitles = subtitle ? assDialogues(deps.store.read(subtitle.path).toString('utf8')) : [];
    const sameClips = row.clipIds.length === currentIds.length && row.clipIds.every((id, index) => id === currentIds[index]);
    return {
      id: row.id,
      assetId: row.assetId,
      subtitleAssetId: row.subtitleAssetId,
      durationSec: asset?.durationSec ?? 0,
      width: asset?.width ?? FINAL_SPEC.width,
      height: asset?.height ?? FINAL_SPEC.height,
      fps: FINAL_SPEC.fps,
      subtitles,
      needsReconfirm: !sameClips || stale,
      createdAt: row.createdAt,
    };
  }

  function snapshot(videoId: string) {
    const plan = deps.plans.current(videoId);
    const rows = listClips(db, videoId);
    const shots = (plan?.shots ?? []).map((shot) => {
      const row = currentRow(rows, shot.shotKey);
      return { shotKey: shot.shotKey, seq: shot.seq, clip: row ? toClip(row) : null };
    });
    return { plan, shots };
  }

  function get(videoId: string): ClipsResponse {
    const video = requireVideo(videoId);
    const { plan, shots } = snapshot(videoId);
    const clipsRunning = shots.filter((s) => s.clip?.state === 'generating').length;
    const busy = clipsRunning > 0 || musicRunning(videoId) || (pending.get(videoId) ?? 0) > 0;
    const finalRow = latestFinal(db, videoId);
    const currentIds = shots.map((s) => s.clip?.id ?? null);
    const stale = shots.some((s) => s.clip?.needsReconfirm);
    const final = finalRow ? toFinal(finalRow, currentIds, stale) : null;

    // 重新啟動後也接得上：生成都結束、還沒有這一批的成品時合成；有失敗時回到精緻圖
    if (!busy && video.stage === 'video_generating' && plan) {
      if (shots.some((s) => s.clip?.state === 'failed')) setStage(videoId, 'frames');
      else if (shots.every((s) => s.clip?.state === 'ready') && (!final || final.needsReconfirm)) {
        schedule(videoId, () => compose(videoId));
        return get(videoId);
      }
    }
    const generating = busy || (video.stage === 'video_generating' && !shots.some((s) => s.clip?.state === 'failed'));
    return {
      generating,
      generatingLabel: generating ? clipGeneratingLabel(clipsRunning || shots.length) : null,
      shots,
      final,
      composeError: composeErrors.get(videoId) ?? null,
    };
  }

  /** 依序執行這支影片的背景工作 */
  function schedule(videoId: string, task: () => Promise<void>) {
    pending.set(videoId, (pending.get(videoId) ?? 0) + 1);
    const previous = work.get(videoId) ?? Promise.resolve();
    const next = previous
      .then(task)
      .catch(() => undefined)
      .finally(() => pending.set(videoId, (pending.get(videoId) ?? 1) - 1));
    work.set(videoId, next);
  }

  function requireGeneration(): FrameGeneration {
    if (!deps.generation) throw new StudioError(503, deps.unavailableMessage ?? '還沒設定生成服務');
    return deps.generation;
  }

  function videoModelOf(video: Video): WorkflowModel {
    const model = deps.workflows.models[video.videoModel];
    if (!model) throw new StudioError(503, `workflows 設定沒有「${video.videoModel}」`);
    if (!model.frameInputs) throw new StudioError(503, `${model.label} 的首格輸入方式還沒實測（07「下一輪測試」），不能生成影片`);
    if (!deps.workflows.upload) throw new StudioError(503, new UploadNotConfiguredError().message);
    return model;
  }

  function secondsOf(model: WorkflowModel, shot: Shot): number {
    return generatedClipSec(shot.durationSec, { min: model.slots?.durationSec?.min, max: model.slots?.durationSec?.max });
  }

  /** 這一格要不要重新生成：沒有影片、失敗或需重新確認 */
  function needsClip(row: ClipRow | null): boolean {
    if (!row) return true;
    const clip = toClip(row);
    return clip.state === 'failed' || clip.needsReconfirm;
  }

  function setAt(args: Record<string, unknown>, keys: readonly string[], value: unknown) {
    let node = args;
    for (const key of keys.slice(0, -1)) {
      const next = node[key];
      if (typeof next !== 'object' || next === null || Array.isArray(next)) node[key] = {};
      node = node[key] as Record<string, unknown>;
    }
    node[keys.at(-1) ?? ''] = value;
  }

  type Built = { clipId: string; shotKey: string; request: Omit<GenerationRequest, 'consentToken'> };

  /** 一格影片的生成請求：撰寫最終指令（帶入連續性鎖）→ 上傳首格、末格與參考圖 → 組出 MCP 呼叫 */
  async function buildClip(
    generation: FrameGeneration,
    video: Video,
    baseModel: WorkflowModel,
    plan: Plan,
    shot: Shot,
    uploaded: Map<string, string>,
    revision: string | null,
  ): Promise<Built> {
    const file = deps.prompts.get(SHOT_VIDEO_NODE);
    if (!file) throw new Error(`找不到生成指令：${SHOT_VIDEO_NODE}`);
    const frames = deps.frames.detail(video.id, shot.shotKey);
    const first = frames.first?.assetId;
    if (!first) throw new StudioError(409, `還不能生成影片：第 ${shot.seq} 格還沒有精緻圖`);
    const lastFrame = shot.keyframesEnabled ? (frames.last?.assetId ?? null) : null;
    const keyframes = [...frames.keyframes].filter((k) => k.assetId).sort((a, b) => (a.atSec ?? 0) - (b.atSec ?? 0));
    // 有末格或關鍵畫格、模型沒有末格輸入但有參考圖範本（Gemini r2v）：改用它，末格與關鍵畫格當參考圖（07 實測，2026-11-03）
    const variant = (lastFrame || keyframes.length > 0) && !baseModel.frameInputs?.last ? baseModel.referenceVariant : undefined;
    const model: WorkflowModel = variant ? { ...baseModel, args: variant.args, slots: variant.slots, frameInputs: variant.frameInputs, references: variant.references } : baseModel;
    // 末格放進參考圖時，不再當首尾畫格送
    const last = variant ? null : lastFrame;
    if (last && !model.frameInputs?.last) throw new StudioError(503, `${model.label} 的末格輸入方式還沒實測（07「下一輪測試」），不能生成影片`);
    if (keyframes.length > 0 && !model.references) throw new StudioError(503, `${model.label} 的參考圖輸入方式還沒實測（07「下一輪測試」），不能用中間關鍵畫格`);

    const cast = deps.characters.listForVideo(video.id).filter((c) => shot.characters.includes(c.name));
    const boardVersion = video.templeBoardVersionId ? findBoardVersion(db, video.templeBoardVersionId) : null;
    const view = boardVersion ? listViews(db, boardVersion.id).find((v) => v.viewKey === shot.viewKey) : undefined;
    // 參考圖：（改用參考圖範本時的末格）→ 中間關鍵畫格（依時間）→ 角色定裝圖 → 定裝版視角圖；超過模型一次收的張數時拼成一張
    const references = model.references
      ? await fitReferences(
          [
            ...(variant && lastFrame ? [{ label: `第 ${shot.seq} 格的末格（最後一個畫面）`, assetId: lastFrame }] : []),
            ...keyframes.map((k, index) => ({ label: `關鍵畫格 ${index + 1}（第 ${k.atSec ?? 0} 秒）`, assetId: k.assetId ?? '' })),
            ...cast.flatMap((c) => (c.version.lookAssetId ? [{ label: `角色「${c.name}」定裝圖`, assetId: c.version.lookAssetId }] : [])),
            ...(view?.assetId ? [{ label: `定裝版視角圖「${view.viewName}」`, assetId: view.assetId }] : []),
          ],
          model.references,
          deps.sheets ?? null,
        ).catch((error: unknown) => {
          throw new StudioError(503, error instanceof Error ? error.message : '參考圖拼接失敗');
        })
      : [];

    const seconds = secondsOf(model, shot);
    const characters = cast.map((c) => ({ name: c.name, continuityLocks: c.version.continuityLocks }));
    const appearanceLocks = boardVersion?.appearanceLocks ?? [];
    const locks = frameLocks(characters, appearanceLocks);
    const nativeVoice = shot.nativeVoice ?? true;
    const next = plan.shots.find((s) => s.seq === shot.seq + 1);
    const referenceText = [
      `首格（第一個畫面）：第 ${shot.seq} 格確認的精緻圖`,
      ...(last ? [`末格（最後一個畫面）：第 ${shot.seq} 格的末格`] : []),
      ...references.map((ref, index) => `參考圖 ${index + 1}：${ref.label}`),
    ].join('；');
    const variables = {
      shot: {
        seq: shot.seq,
        durationSec: seconds,
        description: shot.description,
        actionStart: shot.actionStart,
        actionEnd: shot.actionEnd,
        shotSize: shot.shotSize,
        cameraMove: shot.cameraMove,
        cameraSpeed: shot.cameraSpeed,
        cameraAngle: shot.cameraAngle,
        keyframeTimeline: keyframeTimeline(shot.durationSec, keyframes.map((k) => k.atSec ?? 0)),
        characters: characters.map((c) => c.name).join('、'),
        lighting: shot.lighting,
        speaker: nativeVoice ? shot.speaker : '',
        dialogue: nativeVoice ? shot.dialogue : '',
        ambience: '',
      },
      character: { locks: locks.filter((lock) => !appearanceLocks.includes(lock)).join('; ') },
      temple: { appearanceLocks: appearanceLocks.join('; ') },
      references: referenceText,
      nextShot: { actionStart: next?.actionStart ?? '' },
      series: { style: seriesSettingsForVideo(db, video)?.visualStyle ?? '' },
      // 使用者調整指令：對話修改成品時排定的調整（第 12 階段）＋不使用原生語音的說明
      instruction: [revision ?? '', nativeVoice ? '' : '這一格不使用原生語音：畫面中的人不開口說台詞，台詞只出現在字幕'].filter(Boolean).join('；'),
    };
    const { request } = renderPrompt(file, variables, { model: video.videoModel });
    let composed;
    try {
      composed = await composeFinalPrompt({ request, locks, writer: generation.writer });
    } catch (error: unknown) {
      throw new StudioError(502, error instanceof Error ? error.message : '撰寫最終指令失敗');
    }

    const send = async (assetId: string) => {
      let remote = uploaded.get(assetId);
      if (!remote) {
        remote = (await generation.sendAsset(getCloudOkAsset(db, assetId))).remoteRef;
        uploaded.set(assetId, remote);
      }
      return remote;
    };
    let firstRef: string;
    let lastRef: string | null = null;
    const refs: string[] = [];
    try {
      firstRef = await send(first);
      if (last) lastRef = await send(last);
      for (const ref of references) refs.push(await send(ref.assetId));
    } catch (error: unknown) {
      if (error instanceof UploadNotConfiguredError) throw new StudioError(503, error.message);
      throw new StudioError(502, error instanceof Error ? error.message : '上傳首格失敗');
    }

    let call: McpCall;
    try {
      const values = { output: { prompt: composed.prompt }, target: { aspectRatio: file.target.aspectRatio ?? '16:9' }, shot: { durationSec: seconds } };
      // 改用參考圖範本時，用它的 args 與 slots 組呼叫
      const config = variant ? { ...deps.workflows, models: { ...deps.workflows.models, [video.videoModel]: model } } : deps.workflows;
      call = buildMcpCall({ modelKey: video.videoModel, config, bindings: file.bindings ?? {}, values, seed: 0 });
      const args = structuredClone(call.args);
      for (const keys of model.frameInputs?.first.paths ?? []) setAt(args, keys, firstRef);
      if (lastRef) for (const keys of model.frameInputs?.last?.paths ?? []) setAt(args, keys, lastRef);
      call = refs.length > 0 ? attachReferenceImages({ tool: call.tool, args }, model, refs) : { tool: call.tool, args };
    } catch (error: unknown) {
      if (error instanceof CallBuildError) throw new StudioError(503, error.message);
      throw error;
    }
    const clipId = clock.newId();
    return {
      clipId,
      shotKey: shot.shotKey,
      request: {
        videoId: video.id,
        node: SHOT_VIDEO_NODE,
        target: { clipId, shotKey: shot.shotKey },
        promptRef: { id: file.id, version: file.version },
        modelKey: video.videoModel,
        call,
        costItems: [{ model: video.videoModel, units: seconds }],
        input: { prompt: composed.prompt, notes: composed.notes ?? null, references: refs, firstFrame: firstRef, lastFrame: lastRef, planVersion: plan.version, promptSource: composed.source },
        outputKind: 'clip',
      },
    };
  }

  /** 背景音樂：ACE-Step，長度等於成品長度，只有配樂 */
  function buildMusic(video: Video, totalSec: number): Omit<GenerationRequest, 'consentToken'> | null {
    const music = deps.workflows.music;
    if (!music) return null;
    const model = deps.workflows.models[music.model];
    const durationSec = Math.max(totalSec, model?.slots?.durationSec?.min ?? 0);
    let call: McpCall;
    try {
      call = buildMcpCall({
        modelKey: music.model,
        config: deps.workflows,
        bindings: { prompt: 'music.tags', durationSec: 'music.durationSec' },
        values: { music: { tags: music.tags, durationSec } },
        seed: 0,
      });
    } catch (error: unknown) {
      if (error instanceof CallBuildError) throw new StudioError(503, error.message);
      throw error;
    }
    return {
      videoId: video.id,
      node: MUSIC_NODE,
      target: { music: true },
      promptRef: null,
      modelKey: music.model,
      call,
      costItems: [{ model: music.model, units: 1 }],
      input: { tags: music.tags, durationSec },
      outputKind: 'audio',
    };
  }

  /** 偏差比對：關鍵畫格與影片對應時間點的畫面 */
  async function measure(clipId: string) {
    const row = findClip(db, clipId);
    if (!row?.assetId) return;
    const clipAsset = findAsset(db, row.assetId);
    if (!clipAsset) return;
    const keyframes = deps.frames.detail(row.videoId, row.shotKey).keyframes.filter((k) => k.assetId);
    const similarity = [];
    for (const keyframe of keyframes) {
      const image = findAsset(db, keyframe.assetId ?? '');
      if (!image) continue;
      const atSec = keyframe.atSec ?? 0;
      const [a, b] = await Promise.all([
        deps.ffmpeg.grayFrame(deps.store.pathOf(image.path), null, SIMILARITY_SIZE),
        deps.ffmpeg.grayFrame(deps.store.pathOf(clipAsset.path), atSec, SIMILARITY_SIZE),
      ]);
      similarity.push({ atSec, score: grayscaleSimilarity(a, b) });
    }
    updateClip(db, row.id, { keyframeSimilarity: similarity });
  }

  /** 所有格的影片都好了就合成；有失敗時回到精緻圖 */
  async function compose(videoId: string) {
    const { plan, shots } = snapshot(videoId);
    if (!plan || shots.length === 0) return;
    if (shots.some((s) => s.clip?.state === 'failed')) {
      setStage(videoId, 'frames');
      return;
    }
    if (!shots.every((s) => s.clip?.state === 'ready' && s.clip.assetId)) return;
    if (musicRunning(videoId)) return;
    const current = latestFinal(db, videoId);
    const ids = shots.map((s) => s.clip?.id ?? '');
    if (current && current.clipIds.join() === ids.join() && !shots.some((s) => s.clip?.needsReconfirm)) return;

    const dir = mkdtempSync(path.join(tmpdir(), 'templeyard-compose-'));
    try {
      const ass = buildAss(subtitleEvents(plan.shots));
      const subtitleId = clock.newId();
      const subtitleBytes = new TextEncoder().encode(ass);
      const savedSubtitle = deps.store.save({ id: subtitleId, kind: 'subtitle', mime: 'text/x-ssa', bytes: subtitleBytes });
      insertAsset(db, { id: subtitleId, kind: 'subtitle', mime: 'text/x-ssa', path: savedSubtitle.path, sha256: savedSubtitle.sha256 });

      const musicId = readyMusic(videoId);
      const musicAsset = musicId ? findAsset(db, musicId) : null;
      const output = path.join(dir, 'final.mp4');
      await deps.ffmpeg.compose({
        clips: plan.shots.map((shot, index) => {
          const asset = findAsset(db, shots[index]?.clip?.assetId ?? '');
          if (!asset) throw new Error(`第 ${shot.seq} 格的影片檔不見了`);
          return { path: deps.store.pathOf(asset.path), durationSec: shot.durationSec };
        }),
        music: musicAsset ? deps.store.pathOf(musicAsset.path) : null,
        subtitlesPath: deps.store.pathOf(savedSubtitle.path),
        output,
      });
      const info = await deps.ffmpeg.probe(output);
      if (info.width !== FINAL_SPEC.width || info.height !== FINAL_SPEC.height || info.fps !== FINAL_SPEC.fps) {
        throw new Error(`成品規格不符：${info.width}×${info.height}、${info.fps} fps`);
      }
      const finalId = clock.newId();
      const bytes = readFileSync(output);
      const saved = deps.store.save({ id: finalId, kind: 'final', mime: 'video/mp4', bytes });
      const totalSec = plan.shots.reduce((sum, shot) => sum + shot.durationSec, 0);
      insertAsset(db, { id: finalId, kind: 'final', mime: 'video/mp4', path: saved.path, sha256: saved.sha256, width: info.width, height: info.height, durationSec: totalSec });
      insertFinal(db, { id: clock.newId(), videoId, assetId: finalId, clipIds: ids, subtitleAssetId: subtitleId, createdAt: clock.now().toISOString() });
      for (const shot of shots) if (shot.clip) updateClip(db, shot.clip.id, { selected: true });
      composeErrors.delete(videoId);
      setStage(videoId, 'final');
    } catch (error: unknown) {
      composeErrors.set(videoId, error instanceof Error ? error.message : '合成失敗');
      setStage(videoId, 'frames');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  return {
    get,

    async generate(videoId, consentToken) {
      const video = requireVideo(videoId);
      const plan = deps.plans.current(videoId);
      if (!plan) throw new StudioError(409, '還沒有分鏡方案');
      const blockers = clipBlockers(deps.frames.get(videoId).shots);
      if (blockers.length > 0) throw new StudioError(409, `還不能生成影片：${blockers[0]}`);
      if (get(videoId).generating) throw new StudioError(409, '影片還在生成中');
      const generation = requireGeneration();
      const model = videoModelOf(video);

      const rows = listClips(db, videoId);
      const todo = plan.shots.filter((shot) => needsClip(currentRow(rows, shot.shotKey)));
      // 一定要末格的模型（Seedance 首尾畫格範本）：沒有末格的格子送出前擋下，不讓範本用示範圖
      if (model.frameInputs?.last?.required) {
        const missing = todo.find((shot) => !shot.keyframesEnabled || !deps.frames.detail(videoId, shot.shotKey).last?.assetId);
        if (missing) {
          throw new StudioError(409, `還不能生成影片：第 ${missing.seq} 格沒有末格。${model.label} 每一格都要有末格，請在細修頁開啟中間關鍵畫格並產生末格`);
        }
      }
      const totalSec = plan.shots.reduce((sum, shot) => sum + shot.durationSec, 0);
      const music = !readyMusic(videoId) ? buildMusic(video, totalSec) : null;
      const items: CostItem[] = [];
      const seconds = todo.reduce((sum, shot) => sum + secondsOf(model, shot), 0);
      if (todo.length > 0) items.push({ model: video.videoModel, units: seconds });
      if (music) items.push(...music.costItems);

      composeErrors.delete(videoId);
      if (items.length === 0) {
        // 影片都還能用：只重新合成（本機，不花錢）
        setStage(videoId, 'video_generating');
        schedule(videoId, () => compose(videoId));
        return { status: 'accepted', clips: get(videoId) };
      }
      const perRequest = [...todo.map((shot) => [{ model: video.videoModel, units: secondsOf(model, shot) }]), ...(music ? [music.costItems] : [])];
      const check = generation.service.precheck(videoId, items, consentToken, perRequest);
      if (!check.ok) return { status: 'consent_required', check: check.check };

      const uploaded = new Map<string, string>();
      const built: Built[] = [];
      for (const shot of todo) {
        const current = currentRow(rows, shot.shotKey);
        built.push(await buildClip(generation, video, model, plan, shot, uploaded, current ? revisionOf(current) : null));
      }

      const now = clock.now().toISOString();
      for (const item of built) {
        insertClip(db, {
          id: item.clipId,
          videoId,
          shotKey: item.shotKey,
          assetId: null,
          generationId: null,
          selected: false,
          keyframeSimilarity: [],
          basedOn: { planVersion: plan.version },
          needsReconfirm: false,
          createdAt: now,
        });
      }
      const outcome = await generation.service.submitBatch([...built.map((item) => item.request), ...(music ? [music] : [])], consentToken);
      if (outcome.status === 'consent_required') {
        deleteClips(db, built.map((item) => item.clipId));
        return { status: 'consent_required', check: outcome.check };
      }
      built.forEach((item, index) => updateClip(db, item.clipId, { generationId: outcome.generationIds[index] ?? null }));
      setStage(videoId, 'video_generating');
      return { status: 'accepted', clips: get(videoId) };
    },

    invalidate(videoId, change) {
      const plan = deps.plans.current(videoId);
      if (!plan) return;
      const { clips: keys } = invalidatedBy(change, plan.shots);
      const rows = listClips(db, videoId);
      for (const key of keys) {
        const row = currentRow(rows, key);
        if (row) updateClip(db, row.id, { needsReconfirm: true });
      }
    },

    clipOf(videoId, shotKey) {
      const row = currentRow(listClips(db, videoId), shotKey);
      return row ? toClip(row) : null;
    },

    scheduleRevision(videoId, seqs, instruction) {
      requireVideo(videoId);
      if (!latestFinal(db, videoId)) throw new StudioError(409, NO_FINAL_MESSAGE);
      const plan = deps.plans.current(videoId);
      const rows = listClips(db, videoId);
      const targets = seqs.map((seq) => {
        const shot = plan?.shots.find((s) => s.seq === seq);
        const row = shot ? currentRow(rows, shot.shotKey) : null;
        if (!shot || !row) throw new StudioError(404, `方案沒有第 ${seq} 格`);
        return row;
      });
      for (const row of targets) updateClip(db, row.id, { needsReconfirm: true, basedOn: { ...row.basedOn, revision: instruction } });
      return get(videoId);
    },

    confirmFinal(videoId) {
      requireVideo(videoId);
      const { final } = get(videoId);
      if (!final) throw new StudioError(409, NO_FINAL_MESSAGE);
      if (final.needsReconfirm) throw new StudioError(409, FINAL_STALE_MESSAGE);
      setStage(videoId, 'done');
      return get(videoId);
    },

    finalFile(videoId) {
      const video = requireVideo(videoId);
      const row = latestFinal(db, videoId);
      const asset = row ? findAsset(db, row.assetId) : null;
      if (!row || !asset) throw new StudioError(404, NO_FINAL_MESSAGE);
      const temple = findTemple(db, video.templeId);
      return { path: deps.store.pathOf(asset.path), filename: downloadFileName(temple?.name ?? '廟埕影室', row.createdAt) };
    },

    async whenComposed(videoId) {
      // 生成剛結束時排進來的工作也要等
      for (let round = 0; round < 3; round += 1) await (work.get(videoId) ?? Promise.resolve());
    },

    handleGenerated(generation, assetIds) {
      const videoId = generation.videoId;
      if (!videoId) return;
      const assetId = assetIds[0];
      if (generation.node === MUSIC_NODE) {
        if (assetId) db.update(generations).set({ target: { ...generation.target, assetId } }).where(eq(generations.id, generation.id)).run();
        schedule(videoId, () => compose(videoId));
        return;
      }
      const clipId = typeof generation.target.clipId === 'string' ? generation.target.clipId : null;
      if (!clipId || !assetId) return;
      updateClip(db, clipId, { assetId });
      schedule(videoId, async () => {
        await measure(clipId);
        await compose(videoId);
      });
    },
  };
}

const RUNNING: readonly GenerationRow['status'][] = ['awaiting_confirm', 'submitted', 'running'];

/** 對話修改成品時排定的調整指令，記在這一支影片的 based_on.revision */
function revisionOf(row: ClipRow): string | null {
  return typeof row.basedOn.revision === 'string' ? row.basedOn.revision : null;
}
