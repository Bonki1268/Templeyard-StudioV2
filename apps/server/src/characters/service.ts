import { CallBuildError, buildMcpCall, composeFinalPrompt, renderPrompt, type PromptWriter } from '@templeyard/prompts';
import {
  updateCharacterSchema,
  type Character,
  type CostCheck,
  type McpCall,
  type PromptFile,
  type UpdateCharacterInput,
  type Video,
  type WorkflowConfig,
} from '@templeyard/shared';
import type { AppDatabase } from '../db/client.js';
import type { CharacterRow, CharacterVersionRow, GenerationRow } from '../db/schema.js';
import type { GenerationRequest, GenerationService, SucceededHandler } from '../generations/service.js';
import { findSeries, type Clock } from '../series/repository.js';
import { StudioError, VIDEO_NOT_FOUND } from '../studio/errors.js';
import { findVersion as findBoardVersion, listViews } from '../templeBoards/repository.js';
import { findVideo } from '../videos/repository.js';
import {
  findCharacter,
  findCharacterName,
  findCharacterVersion,
  insertCharacter,
  insertCharacterVersion,
  latestCharacterGeneration,
  listCharactersFor,
  updateCharacter,
  updateCharacterVersion,
} from './repository.js';

// 角色定裝版（F10）：外觀描述與連續性鎖 → 產生三視圖與定裝圖（付費，要先同意）→ 確認 → 設為系列角色

export const CHARACTER_SHEET_NODE = 'character-sheet';
export const CHARACTER_LOOK_NODE = 'character-look';

export type CharacterGeneration = { service: GenerationService; writer: PromptWriter };

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
  /** 修改外觀描述與連續性鎖：目前版本已確認時另存新版本（要重新產生定裝圖）；找不到：StudioError 404 */
  update(characterId: string, input: UpdateCharacterInput): Character;
  /**
   * 產生三視圖與定裝圖（同一批，兩張；只用文字，不用參考圖）：
   * 沒有同意憑證或憑證不符：consent_required；沒有設定生成服務：StudioError 503；外觀描述空白：StudioError 400
   */
  generate(characterId: string, videoId: string, consentToken: string | null | undefined): Promise<CharacterOutcome>;
  /** 確認：三視圖與定裝圖都產生完成才可以；否則 StudioError 409「「名稱」的定裝圖還沒產生完成」 */
  confirm(characterId: string): Character;
  /** 設為系列角色：要先確認；系列角色同系列的影片都能沿用 */
  setSeries(characterId: string): Character;
  /** 生成完成：接上三視圖或定裝圖 */
  handleGenerated: SucceededHandler;
};

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
}): CharacterService {
  const { db, clock } = deps;

  function requireVideo(videoId: string): Video {
    const video = findVideo(db, videoId);
    if (!video) throw new StudioError(404, VIDEO_NOT_FOUND);
    return video;
  }

  function requireCharacter(id: string) {
    const row = findCharacter(db, id);
    const version = row?.currentVersionId ? findCharacterVersion(db, row.currentVersionId) : null;
    if (!row || !version) throw new StudioError(404, '找不到這個角色');
    return { row, version };
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
      version: {
        id: version.id,
        version: version.version,
        description: version.description,
        continuityLocks: version.continuityLocks,
        sheetAssetId: version.sheetAssetId,
        lookAssetId: version.lookAssetId,
        imageModel: version.imageModel,
        confirmedAt: version.confirmedAt,
      },
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

  function prompt(node: string): PromptFile {
    const file = deps.prompts.get(node);
    if (!file) throw new Error(`找不到生成指令：${node}`);
    return file;
  }

  /** 一張圖的生成請求：撰寫最終指令（檢查連續性鎖）→ 組出 MCP 呼叫（只用文字，不用參考圖） */
  async function buildRequest(
    generation: CharacterGeneration,
    input: { video: Video; character: CharacterRow; version: CharacterVersionRow; part: 'sheet' | 'look' },
  ): Promise<Omit<GenerationRequest, 'consentToken'>> {
    const node = input.part === 'sheet' ? CHARACTER_SHEET_NODE : CHARACTER_LOOK_NODE;
    const file = prompt(node);
    const seriesRow = findSeries(db, input.video.seriesId);
    const boardVersion = input.video.templeBoardVersionId ? findBoardVersion(db, input.video.templeBoardVersionId) : null;
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
    const { request } = renderPrompt(file, variables, { model: input.video.imageModel });
    let composed;
    try {
      composed = await composeFinalPrompt({ request, locks, writer: generation.writer });
    } catch (error: unknown) {
      throw new StudioError(502, error instanceof Error ? error.message : '撰寫最終指令失敗');
    }
    let call: McpCall;
    try {
      const values = { output: { prompt: composed.prompt }, target: { aspectRatio: file.target.aspectRatio ?? '16:9' } };
      call = buildMcpCall({ modelKey: input.video.imageModel, config: deps.workflows, bindings: file.bindings ?? {}, values, seed: 0 });
    } catch (error: unknown) {
      if (error instanceof CallBuildError) throw new StudioError(503, error.message);
      throw error;
    }
    const target: CharacterTarget = { characterVersionId: input.version.id, part: input.part };
    return {
      videoId: input.video.id,
      node,
      target,
      promptRef: { id: file.id, version: file.version },
      modelKey: input.video.imageModel,
      call,
      costItems: [{ model: input.video.imageModel, units: 1 }],
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

    namesOf(ids) {
      return ids.map((id) => findCharacterName(db, id) ?? id);
    },

    update(characterId, rawInput) {
      const { row, version } = requireCharacter(characterId);
      const input = updateCharacterSchema.parse(rawInput);
      if (!version.confirmedAt) {
        updateCharacterVersion(db, version.id, { description: input.description, continuityLocks: input.continuityLocks });
        return load(characterId);
      }
      const versionId = clock.newId();
      db.transaction(() => {
        insertCharacterVersion(db, {
          id: versionId,
          characterId,
          version: version.version + 1,
          description: input.description,
          continuityLocks: input.continuityLocks,
          sheetAssetId: null,
          lookAssetId: null,
          imageModel: version.imageModel,
          confirmedAt: null,
        });
        updateCharacter(db, row.id, { currentVersionId: versionId });
      });
      return load(characterId);
    },

    async generate(characterId, videoId, consentToken) {
      const { row, version } = requireCharacter(characterId);
      const video = requireVideo(videoId);
      if (!version.description.trim()) throw new StudioError(400, '請填寫角色的外觀描述');
      if (version.confirmedAt) throw new StudioError(409, `「${row.name}」已經確認；要修改請先改外觀描述`);
      const generation = deps.generation;
      if (!generation) throw new StudioError(503, deps.unavailableMessage ?? '還沒設定生成服務');
      const items = [{ model: video.imageModel, units: 2 }];
      const precheck = generation.service.precheck(video.id, items, consentToken, [[{ model: video.imageModel, units: 1 }], [{ model: video.imageModel, units: 1 }]]);
      if (!precheck.ok) return { status: 'consent_required', check: precheck.check };
      // 這個版本用這支影片的圖片模型產生
      if (version.imageModel !== video.imageModel) updateCharacterVersion(db, version.id, { imageModel: video.imageModel });
      const current = findCharacterVersion(db, version.id) ?? version;
      const requests = [
        await buildRequest(generation, { video, character: row, version: current, part: 'sheet' }),
        await buildRequest(generation, { video, character: row, version: current, part: 'look' }),
      ];
      updateCharacterVersion(db, version.id, { sheetAssetId: null, lookAssetId: null });
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
      updateCharacter(db, row.id, { isSeries: true, seriesId });
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
