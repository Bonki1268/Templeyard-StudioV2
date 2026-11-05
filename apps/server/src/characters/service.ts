import { CallBuildError, buildMcpCall, composeFinalPrompt, renderPrompt, type PromptWriter } from '@templeyard/prompts';
import {
  composeDescription,
  createSeriesCharacterSchema,
  describeChange,
  filterCharacters,
  splitDescription,
  updateCharacterSchema,
  videoTitle,
  type Character,
  type CharacterPart,
  type CharacterScope,
  type CharacterVersion,
  type LibraryCharacter,
  type CreateSeriesCharacterInput,
  type CostCheck,
  type McpCall,
  type PromptFile,
  type Series,
  type UpdateCharacterInput,
  type Video,
  type WorkflowConfig,
} from '@templeyard/shared';
import type { AppDatabase } from '../db/client.js';
import type { CharacterRow, CharacterVersionRow, GenerationRow } from '../db/schema.js';
import type { GenerationRequest, GenerationService, SucceededHandler } from '../generations/service.js';
import { findSeries, type Clock } from '../series/repository.js';
import { liveSeriesSettings, seriesSettingsForVideo } from '../series/settings.js';
import { StudioError, VIDEO_NOT_FOUND } from '../studio/errors.js';
import { findVersion as findBoardVersion, listViews } from '../templeBoards/repository.js';
import { findTemple } from '../temples/repository.js';
import { findVideo } from '../videos/repository.js';
import {
  characterUsageBySeries,
  findCharacter,
  findCharacterName,
  findCharacterVersion,
  insertCharacter,
  insertCharacterVersion,
  latestCharacterGeneration,
  latestFrameVersionFor,
  listCharacterVersions,
  listCharactersFor,
  listLibraryCharacters,
  listSeriesCharacters,
  updateCharacter,
  updateCharacterVersion,
} from './repository.js';

// 角色定裝版（F10）：外觀描述與連續性鎖 → 產生三視圖與定裝圖（付費，要先同意）→ 確認 → 設為系列角色

export const CHARACTER_SHEET_NODE = 'character-sheet';
export const CHARACTER_LOOK_NODE = 'character-look';

export type CharacterGeneration = { service: GenerationService; writer: PromptWriter };

/** 用到某個角色的影片（角色詳情） */
export type CharacterUsage = { id: string; seriesId: string; title: string; stage: string; version: number };

export type CharacterOutcome = { status: 'consent_required'; check: CostCheck } | { status: 'accepted'; character: Character };

export type CharacterService = {
  /** 這支影片能用的角色：影片專屬角色與同系列的系列角色；影片不存在：StudioError 404 */
  listForVideo(videoId: string): Character[];
  /**
   * 方案裡的角色名稱轉成角色編號：同系列有同名的系列角色就沿用；這支影片已有同名角色就沿用；
   * 都沒有時建立影片專屬角色（第 1 版，外觀描述與連續性鎖照 Agent 給的，沒有就留白）
   */
  resolve(videoId: string, wanted: readonly { name: string; description?: string; continuityLocks?: readonly string[] }[]): Map<string, string>;
  /** 角色編號轉成名稱；找不到的編號原樣回傳（第 7 階段存的是名稱） */
  namesOf(ids: readonly string[]): string[];
  /** 系列角色庫：這個系列的系列角色（使用者 2026-11-05 提出）；系列不存在：StudioError 404 */
  listForSeries(seriesId: string): Character[];
  /** 系列頁角色庫：系列角色加上這個系列影片的影片專屬角色，可搜尋與依範圍篩選；系列不存在：StudioError 404 */
  listLibrary(seriesId: string, options?: { scope?: CharacterScope; query?: string }): LibraryCharacter[];
  /** 角色的所有版本（三視圖、定裝圖、確認日期、差別說明），舊的在前；找不到：StudioError 404 */
  versions(characterId: string): CharacterVersion[];
  /** 用到這個角色的影片與它們使用的版本；找不到：StudioError 404 */
  usage(characterId: string): CharacterUsage[];
  /** 系列角色庫新增角色：第 1 版用系列的預設圖片模型；同系列已有同名的系列角色：StudioError 409；系列不存在：StudioError 404 */
  createForSeries(seriesId: string, input: CreateSeriesCharacterInput): Character;
  /** 修改外觀描述與連續性鎖：目前版本已確認時另存新版本（要重新產生定裝圖）；找不到：StudioError 404 */
  update(characterId: string, input: UpdateCharacterInput): Character;
  /**
   * 產生三視圖與定裝圖（同一批，兩張；只用文字，不用參考圖）：
   * 沒有同意憑證或憑證不符：consent_required；沒有設定生成服務：StudioError 503；外觀描述空白：StudioError 400
   * videoId 為 null（系列角色庫）：只限系列角色，用系列的預設圖片模型，費用與同意憑證算在系列；
   * 影片專屬角色沒有指定影片：StudioError 400「請指定是哪一支影片」
   * part（第 14 階段）：只重生三視圖（sheet）或定裝圖（look）一張；已確認的版本會另存為新版本（另一張沿用原版本）
   */
  generate(characterId: string, videoId: string | null, consentToken: string | null | undefined, part?: CharacterPart): Promise<CharacterOutcome>;
  /** 確認：三視圖與定裝圖都產生完成才可以；否則 StudioError 409「「名稱」的定裝圖還沒產生完成」 */
  confirm(characterId: string): Character;
  /** 設為系列角色：要先確認；系列角色同系列的影片都能沿用 */
  setSeries(characterId: string): Character;
  /** 生成完成：接上三視圖或定裝圖 */
  handleGenerated: SucceededHandler;
};

type GenerateContext = { videoId: string | null; seriesId: string; imageModel: string; templeBoardVersionId: string | null };

type CharacterTarget = { characterVersionId: string; part: 'sheet' | 'look' };

function isCharacterTarget(value: Record<string, unknown>): value is CharacterTarget {
  return typeof value.characterVersionId === 'string' && (value.part === 'sheet' || value.part === 'look');
}

const RUNNING: readonly GenerationRow['status'][] = ['awaiting_confirm', 'submitted', 'running'];

export function createCharacterService(deps: {
  db: AppDatabase;
  clock: Clock;
  workflows: WorkflowConfig;
  prompts: ReadonlyMap<string, PromptFile>;
  generation: CharacterGeneration | null;
  unavailableMessage?: string;
  /** 第 9 階段：確認過的角色另存新版本後通知（精緻圖依失效規則標示需重新確認） */
  onVersionChanged?: (character: Character) => void;
}): CharacterService {
  const { db, clock } = deps;

  function requireVideo(videoId: string): Video {
    const video = findVideo(db, videoId);
    if (!video) throw new StudioError(404, VIDEO_NOT_FOUND);
    return video;
  }

  function requireSeries(seriesId: string): Series {
    const found = findSeries(db, seriesId);
    if (!found) throw new StudioError(404, '找不到這個系列');
    return found;
  }

  function requireCharacter(id: string) {
    const row = findCharacter(db, id);
    const version = row?.currentVersionId ? findCharacterVersion(db, row.currentVersionId) : null;
    if (!row || !version) throw new StudioError(404, '找不到這個角色');
    return { row, version };
  }

  function toVersion(version: CharacterVersionRow): CharacterVersion {
    return {
      id: version.id,
      version: version.version,
      description: version.description,
      identityAnchors: version.identityAnchors,
      look: version.look,
      changeNote: version.changeNote,
      continuityLocks: version.continuityLocks,
      sheetAssetId: version.sheetAssetId,
      lookAssetId: version.lookAssetId,
      imageModel: version.imageModel,
      confirmedAt: version.confirmedAt,
    };
  }

  /**
   * 外觀文字：有給身份錨點或造型時分開存、外觀描述由兩者組成（沒給的那欄沿用上一版）；
   * 只給整段外觀描述（舊寫法）時照存，身份錨點與造型留空；都沒有：StudioError 400
   */
  function resolveText(
    input: { description?: string | undefined; identityAnchors?: string | undefined; look?: string | undefined },
    previous: CharacterVersionRow | null,
  ): { description: string; identityAnchors: string | null; look: string | null } {
    let result: { description: string; identityAnchors: string | null; look: string | null };
    if (input.identityAnchors !== undefined || input.look !== undefined) {
      const before = previous ? splitDescription(previous) : { identityAnchors: '', look: '' };
      const identityAnchors = (input.identityAnchors ?? before.identityAnchors).trim();
      const look = (input.look ?? before.look).trim();
      result = { description: composeDescription(identityAnchors, look), identityAnchors: identityAnchors || null, look: look || null };
    } else {
      result = { description: (input.description ?? '').trim(), identityAnchors: null, look: null };
    }
    if (!result.description) throw new StudioError(400, '請填寫角色的外觀描述');
    return result;
  }

  function textOf(version: CharacterVersionRow) {
    const split = splitDescription(version);
    return { identityAnchors: split.identityAnchors, look: split.look, continuityLocks: version.continuityLocks };
  }

  function toCharacter(row: CharacterRow, version: CharacterVersionRow): Character {
    let state: Character['state'] = 'draft';
    let error: string | null = null;
    if (version.confirmedAt) state = 'confirmed';
    else {
      const latest = [CHARACTER_SHEET_NODE, CHARACTER_LOOK_NODE].map((node) => latestCharacterGeneration(db, node, version.id));
      if (latest.some((g) => g && RUNNING.includes(g.status))) state = 'generating';
      else if (latest.some((g) => g && (g.status === 'failed' || g.status === 'timeout'))) {
        state = 'failed';
        error = latest.find((g) => g?.error)?.error ?? null;
      } else if (version.sheetAssetId && version.lookAssetId) state = 'pending_confirm';
      else if (latest.some((g) => g)) state = 'generating';
    }
    return {
      id: row.id,
      name: row.name,
      isSeries: row.isSeries,
      seriesId: row.seriesId,
      videoId: row.videoId,
      version: toVersion(version),
      state,
      error,
    };
  }

  function load(id: string): Character {
    const { row, version } = requireCharacter(id);
    return toCharacter(row, version);
  }

  function listForVideo(videoId: string): Character[] {
    const video = requireVideo(videoId);
    return listCharactersFor(db, video).flatMap((row) => {
      const version = row.currentVersionId ? findCharacterVersion(db, row.currentVersionId) : null;
      return version ? [toCharacter(row, version)] : [];
    });
  }

  /**
   * 產生定裝圖的情境：有指定影片時用影片的圖片模型與寺廟定裝版；
   * 沒有指定影片（系列角色庫，使用者 2026-11-05 提出）時只限系列角色，用系列的預設圖片模型，不帶寺廟
   */
  function generateContext(character: CharacterRow, videoId: string | null): GenerateContext {
    if (videoId) {
      const video = requireVideo(videoId);
      return { videoId: video.id, seriesId: video.seriesId, imageModel: video.imageModel, templeBoardVersionId: video.templeBoardVersionId };
    }
    if (!character.isSeries || !character.seriesId) throw new StudioError(400, '請指定是哪一支影片');
    const seriesRow = requireSeries(character.seriesId);
    return { videoId: null, seriesId: seriesRow.id, imageModel: seriesRow.defaultImageModel, templeBoardVersionId: null };
  }

  function prompt(node: string): PromptFile {
    const file = deps.prompts.get(node);
    if (!file) throw new Error(`找不到生成指令：${node}`);
    return file;
  }

  /** 一張圖的生成請求：撰寫最終指令（檢查連續性鎖）→ 組出 MCP 呼叫（只用文字，不用參考圖） */
  async function buildRequest(
    generation: CharacterGeneration,
    input: { context: GenerateContext; character: CharacterRow; version: CharacterVersionRow; part: 'sheet' | 'look' },
  ): Promise<Omit<GenerationRequest, 'consentToken'>> {
    const node = input.part === 'sheet' ? CHARACTER_SHEET_NODE : CHARACTER_LOOK_NODE;
    const file = prompt(node);
    const { context } = input;
    // 有指定影片時用建立影片時保存的系列設定；系列角色庫（沒有影片）用系列目前的設定
    const video = context.videoId ? findVideo(db, context.videoId) : null;
    const seriesRow = (video ? seriesSettingsForVideo(db, video) : null) ?? liveSeriesSettings(db, context.seriesId);
    const boardVersion = context.templeBoardVersionId ? findBoardVersion(db, context.templeBoardVersionId) : null;
    const firstView = boardVersion ? listViews(db, boardVersion.id)[0] : undefined;
    const locks = input.version.continuityLocks;
    const variables: Record<string, unknown> = {
      character: {
        name: input.character.name,
        description: input.version.description,
        locks: locks.join('; '),
        reference: '',
        sheet: '與三視圖同一批產生，依相同的外觀描述與連續性鎖',
      },
      view: { name: firstView?.viewName ?? '', reference: '' },
      temple: { appearanceLocks: (boardVersion?.appearanceLocks ?? []).join('; '), lighting: boardVersion?.defaultLighting ?? '' },
      series: { style: seriesRow?.visualStyle ?? '' },
      instruction: '',
    };
    const { request } = renderPrompt(file, variables, { model: context.imageModel });
    let composed;
    try {
      composed = await composeFinalPrompt({ request, locks, writer: generation.writer });
    } catch (error: unknown) {
      throw new StudioError(502, error instanceof Error ? error.message : '撰寫最終指令失敗');
    }
    let call: McpCall;
    try {
      const values = { output: { prompt: composed.prompt }, target: { aspectRatio: file.target.aspectRatio ?? '16:9' } };
      call = buildMcpCall({ modelKey: context.imageModel, config: deps.workflows, bindings: file.bindings ?? {}, values, seed: 0 });
    } catch (error: unknown) {
      if (error instanceof CallBuildError) throw new StudioError(503, error.message);
      throw error;
    }
    const target: CharacterTarget = { characterVersionId: input.version.id, part: input.part };
    return {
      videoId: context.videoId,
      seriesId: context.seriesId,
      node,
      target,
      promptRef: { id: file.id, version: file.version },
      modelKey: context.imageModel,
      call,
      costItems: [{ model: context.imageModel, units: 1 }],
      input: { prompt: composed.prompt, notes: composed.notes ?? null, characterId: input.character.id },
      outputKind: 'character_sheet',
    };
  }

  return {
    listForVideo,

    resolve(videoId, wanted) {
      const video = requireVideo(videoId);
      const result = new Map<string, string>();
      for (const item of wanted) {
        const name = item.name.trim();
        if (!name || result.has(name)) continue;
        const existing = listCharactersFor(db, video).find((row) => row.name === name);
        if (existing) {
          result.set(name, existing.id);
          continue;
        }
        const id = clock.newId();
        const versionId = clock.newId();
        db.transaction(() => {
          insertCharacter(db, { id, seriesId: null, videoId: video.id, name, isSeries: false, currentVersionId: null });
          insertCharacterVersion(db, {
            id: versionId,
            characterId: id,
            version: 1,
            description: item.description?.trim() ?? '',
            identityAnchors: null,
            look: null,
            changeNote: null,
            continuityLocks: [...(item.continuityLocks ?? [])].map((lock) => lock.trim()).filter(Boolean),
            sheetAssetId: null,
            lookAssetId: null,
            imageModel: video.imageModel,
            confirmedAt: null,
          });
          updateCharacter(db, id, { currentVersionId: versionId });
        });
        result.set(name, id);
      }
      return result;
    },

    listLibrary(seriesId, options = {}) {
      requireSeries(seriesId);
      const usage = characterUsageBySeries(db, seriesId);
      const all = listLibraryCharacters(db, seriesId).flatMap((row) => {
        const version = row.currentVersionId ? findCharacterVersion(db, row.currentVersionId) : null;
        return version ? [{ ...toCharacter(row, version), videoCount: usage.get(row.id)?.length ?? 0 }] : [];
      });
      return filterCharacters(all, { scope: options.scope ?? 'all', query: options.query ?? '' });
    },

    versions(characterId) {
      requireCharacter(characterId);
      return listCharacterVersions(db, characterId).map(toVersion);
    },

    usage(characterId) {
      const { row, version } = requireCharacter(characterId);
      const seriesId = row.seriesId ?? (row.videoId ? findVideo(db, row.videoId)?.seriesId : null) ?? null;
      if (!seriesId) return [];
      const versions = listCharacterVersions(db, characterId);
      const numberOf = new Map(versions.map((each) => [each.id, each.version]));
      return (characterUsageBySeries(db, seriesId).get(characterId) ?? []).flatMap((videoId) => {
        const video = findVideo(db, videoId);
        const temple = video ? findTemple(db, video.templeId) : null;
        if (!video || !temple) return [];
        // 這支影片依據的版本：最近一張精緻圖生成時記下的角色版本；還沒有精緻圖就是目前的版本
        const used = latestFrameVersionFor(db, videoId, numberOf) ?? version.version;
        return [{ id: video.id, seriesId: video.seriesId, title: videoTitle(temple.name, video.creativeInput), stage: video.stage, version: used }];
      });
    },

    listForSeries(seriesId) {
      requireSeries(seriesId);
      return listSeriesCharacters(db, seriesId).flatMap((row) => {
        const version = row.currentVersionId ? findCharacterVersion(db, row.currentVersionId) : null;
        return version ? [toCharacter(row, version)] : [];
      });
    },

    createForSeries(seriesId, rawInput) {
      const seriesRow = requireSeries(seriesId);
      const input = createSeriesCharacterSchema.parse(rawInput);
      if (listSeriesCharacters(db, seriesId).some((row) => row.name === input.name)) {
        throw new StudioError(409, `這個系列已經有角色「${input.name}」`);
      }
      const text = resolveText(input, null);
      const id = clock.newId();
      const versionId = clock.newId();
      db.transaction(() => {
        insertCharacter(db, { id, seriesId, videoId: null, name: input.name, isSeries: true, currentVersionId: null });
        insertCharacterVersion(db, {
          id: versionId,
          characterId: id,
          version: 1,
          description: text.description,
          identityAnchors: text.identityAnchors,
          look: text.look,
          changeNote: null,
          continuityLocks: input.continuityLocks,
          sheetAssetId: null,
          lookAssetId: null,
          imageModel: seriesRow.defaultImageModel,
          confirmedAt: null,
        });
        updateCharacter(db, id, { currentVersionId: versionId });
      });
      return load(id);
    },

    namesOf(ids) {
      return ids.map((id) => findCharacterName(db, id) ?? id);
    },

    update(characterId, rawInput) {
      const { row, version } = requireCharacter(characterId);
      const input = updateCharacterSchema.parse(rawInput);
      const text = resolveText(input, version);
      if (!version.confirmedAt) {
        updateCharacterVersion(db, version.id, { ...text, continuityLocks: input.continuityLocks });
        return load(characterId);
      }
      const versionId = clock.newId();
      const changeNote = describeChange(
        { version: version.version, ...textOf(version) },
        { identityAnchors: text.identityAnchors ?? '', look: text.look ?? text.description, continuityLocks: input.continuityLocks },
      );
      db.transaction(() => {
        insertCharacterVersion(db, {
          id: versionId,
          characterId,
          version: version.version + 1,
          ...text,
          changeNote,
          continuityLocks: input.continuityLocks,
          sheetAssetId: null,
          lookAssetId: null,
          imageModel: version.imageModel,
          confirmedAt: null,
        });
        updateCharacter(db, row.id, { currentVersionId: versionId });
      });
      const changed = load(characterId);
      deps.onVersionChanged?.(changed);
      return changed;
    },

    async generate(characterId, videoId, consentToken, part) {
      const { row, version } = requireCharacter(characterId);
      const context = generateContext(row, videoId);
      if (!version.description.trim()) throw new StudioError(400, '請填寫角色的外觀描述');
      // 已確認的版本不能整批重生；只重生其中一張時，另存為新版本
      if (version.confirmedAt && !part) throw new StudioError(409, `「${row.name}」已經確認；要修改請先改外觀描述`);
      const generation = deps.generation;
      if (!generation) throw new StudioError(503, deps.unavailableMessage ?? '還沒設定生成服務');
      const model = context.imageModel;
      const parts: CharacterPart[] = part ? [part] : ['sheet', 'look'];
      const scope = context.videoId ?? { seriesId: context.seriesId };
      const precheck = generation.service.precheck(
        scope,
        [{ model, units: parts.length }],
        consentToken,
        parts.map(() => [{ model, units: 1 }]),
      );
      if (!precheck.ok) return { status: 'consent_required', check: precheck.check };

      // 要產生圖片的版本：已確認的版本另存為新版本（文字不變，另一張沿用原版本的圖），否則就是目前這一版
      let target: CharacterVersionRow = { ...version, imageModel: model };
      const forkFromConfirmed = Boolean(version.confirmedAt);
      if (forkFromConfirmed) {
        target = {
          ...version,
          id: clock.newId(),
          version: version.version + 1,
          changeNote: describeChange({ version: version.version, ...textOf(version) }, textOf(version), part),
          sheetAssetId: part === 'sheet' ? null : version.sheetAssetId,
          lookAssetId: part === 'look' ? null : version.lookAssetId,
          imageModel: model,
          confirmedAt: null,
        };
      }
      const requests = [];
      for (const each of parts) requests.push(await buildRequest(generation, { context, character: row, version: target, part: each }));

      if (forkFromConfirmed) {
        db.transaction(() => {
          insertCharacterVersion(db, target);
          updateCharacter(db, row.id, { currentVersionId: target.id });
        });
        deps.onVersionChanged?.(load(characterId));
      } else {
        updateCharacterVersion(db, target.id, {
          imageModel: model,
          ...(parts.includes('sheet') ? { sheetAssetId: null } : {}),
          ...(parts.includes('look') ? { lookAssetId: null } : {}),
        });
      }
      const outcome = await generation.service.submitBatch(requests, consentToken);
      if (outcome.status === 'consent_required') return { status: 'consent_required', check: outcome.check };
      return { status: 'accepted', character: load(characterId) };
    },

    confirm(characterId) {
      const { row, version } = requireCharacter(characterId);
      const character = toCharacter(row, version);
      if (character.state === 'confirmed') return character;
      if (character.state !== 'pending_confirm') throw new StudioError(409, `「${row.name}」的定裝圖還沒產生完成`);
      updateCharacterVersion(db, version.id, { confirmedAt: clock.now().toISOString() });
      return load(characterId);
    },

    setSeries(characterId) {
      const { row, version } = requireCharacter(characterId);
      if (!version.confirmedAt) throw new StudioError(409, `請先確認「${row.name}」的定裝圖`);
      const seriesId = row.seriesId ?? (row.videoId ? findVideo(db, row.videoId)?.seriesId : null) ?? null;
      if (!seriesId) throw new StudioError(409, '找不到這個角色的系列');
      // 設為系列角色後屬於系列，不再屬於原本那支影片（同 05：系列角色 video_id 為 null）
      updateCharacter(db, row.id, { isSeries: true, seriesId, videoId: null });
      return load(characterId);
    },

    handleGenerated(generation, assetIds) {
      if (!isCharacterTarget(generation.target)) return;
      const assetId = assetIds[0];
      if (!assetId) return;
      const patch = generation.target.part === 'sheet' ? { sheetAssetId: assetId } : { lookAssetId: assetId };
      updateCharacterVersion(db, generation.target.characterVersionId, patch);
    },
  };
}
