import type { Character, CostCheck, PromptFile, UpdateCharacterInput, WorkflowConfig } from '@templeyard/shared';
import type { PromptWriter } from '@templeyard/prompts';
import type { AppDatabase } from '../db/client.js';
import type { GenerationService, SucceededHandler } from '../generations/service.js';
import type { Clock } from '../series/repository.js';

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

export function createCharacterService(_deps: {
  db: AppDatabase;
  clock: Clock;
  workflows: WorkflowConfig;
  prompts: ReadonlyMap<string, PromptFile>;
  generation: CharacterGeneration | null;
  unavailableMessage?: string;
}): CharacterService {
  throw new Error('尚未實作');
}
