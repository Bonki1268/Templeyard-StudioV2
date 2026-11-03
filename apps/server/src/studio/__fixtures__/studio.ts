import { createClaudeModel, type ClaudeModel } from '@templeyard/agent';
import { loadPromptFiles, loadWorkflowConfig, promptsDir, workflowsFile } from '@templeyard/prompts';
import type { VideoStage } from '@templeyard/shared';
import { eq } from 'drizzle-orm';
import { FAKE_CLAUDE_API_KEY, startFakeClaude, type FakeClaude } from '../../../../../tests/fakes/claude/server.js';
import { insertAsset } from '../../assets/repository.js';
import { createConsentStore } from '../../costs/consents.js';
import { openDatabase, type AppDatabase } from '../../db/client.js';
import { series, templeBoardVersions, templeBoards, templeViews, temples, videos } from '../../db/schema.js';
import { insertPhoto } from '../../photos/repository.js';
import type { Clock } from '../../series/repository.js';

// 創作工作區測試共用的環境：記憶體資料庫、假的 Claude API（錄製的回應）、固定的時間與編號。

export type StudioWorld = {
  db: AppDatabase;
  clock: Clock;
  fake: FakeClaude;
  /** 指向假的 Claude API 的模型 */
  model: ClaudeModel;
  workflows: ReturnType<typeof loadWorkflowConfig>;
  prompts: ReturnType<typeof loadPromptFiles>;
  consents: ReturnType<typeof createConsentStore>;
  close(): Promise<void>;
};

export async function createStudioWorld(): Promise<StudioWorld> {
  const fake = await startFakeClaude();
  const db = openDatabase(':memory:');
  let id = 0;
  let tick = 0;
  // 每次取時間往後 1 秒，排序才看得出先後
  const clock: Clock = { now: () => new Date(Date.UTC(2026, 10, 3, 9, 0, tick++)), newId: () => `id-${++id}` };

  db.insert(temples)
    .values([
      {
        id: 't1',
        name: '板橋慈惠宮',
        nameNormalized: '板橋慈惠宮',
        flags: [],
        status: 'active',
        district: '板橋區',
        address: '新北市板橋區府中路 81 號',
        phoneRaw: '',
        deity: '天上聖母',
        religion: '道教',
        foundedYear: 1853,
        foundedRaw: '',
        rebuiltRaw: '',
      },
      {
        id: 't2',
        name: '新莊地藏庵',
        nameNormalized: '新莊地藏庵',
        flags: [],
        status: 'active',
        district: '新莊區',
        address: '新北市新莊區中正路 80 號',
        phoneRaw: '',
        deity: '地藏王菩薩',
        religion: '佛教',
        foundedRaw: '',
        rebuiltRaw: '',
      },
    ])
    .run();
  db.insert(series)
    .values({
      id: 's1',
      name: '新北廟宇故事',
      visualStyle: '溫暖寫實、黃昏暖色調',
      durationSec: 30,
      direction: '歷史故事',
      defaultImageModel: 'nano-banana-pro',
      defaultVideoModel: 'gemini-omni-1.1-flash',
      createdAt: 'x',
      updatedAt: 'x',
    })
    .run();

  return {
    db,
    clock,
    fake,
    model: createClaudeModel({ apiKey: FAKE_CLAUDE_API_KEY, model: 'fake-agent-model', baseURL: fake.url }),
    workflows: loadWorkflowConfig(workflowsFile),
    prompts: loadPromptFiles(promptsDir),
    consents: createConsentStore({ now: () => new Date(), newToken: () => `consent-${++id}` }),
    close: () => fake.close(),
  };
}

/** 新增一支影片；預設是定裝版已確認、可以開始對話（chat） */
export function addVideo(
  world: StudioWorld,
  input: { id: string; templeId?: string; stage?: VideoStage; userTempleNotes?: string; creativeInput?: string | null },
): string {
  world.db
    .insert(videos)
    .values({
      id: input.id,
      seriesId: 's1',
      templeId: input.templeId ?? 't1',
      stage: input.stage ?? 'chat',
      imageModel: 'nano-banana-pro',
      videoModel: 'gemini-omni-1.1-flash',
      modelsLockedAt: 'x',
      userTempleNotes: input.userTempleNotes ?? '',
      creativeInput: input.creativeInput ?? null,
      createdAt: 'x',
      updatedAt: 'x',
    })
    .run();
  return input.id;
}

let photoCounter = 0;

/** 這間廟的一張照片（同系列同一間廟的照片每支影片共用）；回傳照片編號 */
export function addPhoto(world: StudioWorld, input: { templeId?: string; viewKey?: string | null } = {}): string {
  photoCounter += 1;
  const originalId = `original-${photoCounter}`;
  const deidId = `deid-${photoCounter}`;
  insertAsset(world.db, { id: originalId, kind: 'original_photo', mime: 'image/png', path: `x/${originalId}.png`, sha256: originalId });
  insertAsset(world.db, { id: deidId, kind: 'deid_photo', mime: 'image/png', path: `x/${deidId}.png`, sha256: deidId });
  return insertPhoto(
    world.db,
    {
      seriesId: 's1',
      templeId: input.templeId ?? 't1',
      videoId: null,
      originalAssetId: originalId,
      deidentifiedAssetId: deidId,
      viewKey: input.viewKey ?? 'front_overview',
      deidBoxes: [],
    },
    world.clock,
  ).id;
}

/** 這支影片確認過的寺廟定裝版（只有資料，沒有圖）：預設只有「廟前全景」 */
export function addConfirmedBoard(world: StudioWorld, videoId: string, views: { viewKey: string; viewName: string }[] = [{ viewKey: 'front_overview', viewName: '廟前全景' }]): string {
  const boardId = `board-${videoId}`;
  const versionId = `board-version-${videoId}`;
  world.db.insert(templeBoards).values({ id: boardId, seriesId: 's1', templeId: 't1', currentVersionId: versionId }).run();
  world.db
    .insert(templeBoardVersions)
    .values({ id: versionId, boardId, version: 1, imageModel: 'nano-banana-pro', appearanceLocks: [], defaultLighting: '晴天午後', confirmedAt: 'x' })
    .run();
  for (const view of views) {
    world.db
      .insert(templeViews)
      .values({ id: `${versionId}-${view.viewKey}`, boardVersionId: versionId, viewKey: view.viewKey, viewName: view.viewName, source: 'photo', confirmed: true })
      .run();
  }
  world.db.update(videos).set({ templeBoardVersionId: versionId }).where(eq(videos.id, videoId)).run();
  return versionId;
}
