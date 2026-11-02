import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createCloudAssetSender,
  createComfyClient,
  createLimiter,
  createMcpSession,
  createMcpUploadTransport,
  type CloudAssetTransport,
} from '@templeyard/comfy-client';
import { loadPromptFiles, loadWorkflowConfig, promptsDir, repoRoot } from '@templeyard/prompts';
import type { WorkflowConfig, WrittenPrompt } from '@templeyard/shared';
import { FAKE_API_KEY, FAKE_PNG, startFakeComfyMcp, type FakeComfyMcp } from '../../../../../tests/fakes/comfy-mcp/server.js';
import { createFakeWriter, echoWriterResponse } from '../../../../../tests/fakes/claude/fake-writer.js';
import { findAsset, insertAsset } from '../../assets/repository.js';
import { createAssetStore, type AssetStore } from '../../assets/store.js';
import { createConsentStore, type ConsentStore } from '../../costs/consents.js';
import { updateSettings } from '../../costs/repository.js';
import { openDatabase, type AppDatabase } from '../../db/client.js';
import { series, temples, videos } from '../../db/schema.js';
import { createGenerationService, type GenerationService, type SucceededHandler } from '../../generations/service.js';
import { insertPhoto } from '../../photos/repository.js';
import type { Clock } from '../../series/repository.js';

// 定裝版測試共用的環境：記憶體資料庫、假的 MCP 伺服器、假的撰寫者、暫存的檔案資料夾。
// 工作流程設定用情境測試那一份（有假的上傳工具與參考圖位置），正式設定另外測。

export const e2eWorkflowsFile = path.join(repoRoot, 'tests', 'fakes', 'comfy-mcp', 'workflows.e2e.json');

/** 原圖與去識別圖的內容不同，才分得出送出去的是哪一個 */
export const ORIGINAL_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 1, 1]);
export const DEID_BYTES = FAKE_PNG;

export type World = {
  db: AppDatabase;
  fake: FakeComfyMcp;
  store: AssetStore;
  assetsDir: string;
  clock: Clock & { advance(ms: number): void };
  workflows: WorkflowConfig;
  consents: ConsentStore;
  generation: GenerationService;
  writer: ReturnType<typeof createFakeWriter>;
  transport: CloudAssetTransport;
  sendAsset: ReturnType<typeof createCloudAssetSender>;
  /** 生成服務完成時呼叫的處理（由測試接上定裝版服務） */
  handlers: Record<string, SucceededHandler>;
  prompts: ReturnType<typeof loadPromptFiles>;
  seriesId: string;
  templeId: string;
  close(): Promise<void>;
};

let counter = 0;

export async function createWorld(options: { writerResponses?: WrittenPrompt[]; workflows?: WorkflowConfig } = {}): Promise<World> {
  const fake = await startFakeComfyMcp();
  const assetsDir = mkdtempSync(path.join(tmpdir(), 'templeyard-board-'));
  const store = createAssetStore(assetsDir);
  const db = openDatabase(':memory:');
  let fakeNow = 0;
  let id = 0;
  const clock = {
    now: () => new Date(Date.UTC(2026, 10, 3, 9, 0) + fakeNow),
    newId: () => `id-${++id}`,
    advance: (ms: number) => {
      fakeNow += ms;
    },
  };
  const workflows = options.workflows ?? loadWorkflowConfig(e2eWorkflowsFile);
  const session = createMcpSession({ url: fake.url, apiKey: FAKE_API_KEY });
  const comfy = createComfyClient({
    session,
    pollMs: 1000,
    timeoutMs: 60_000,
    now: () => Date.UTC(2026, 10, 3, 9, 0) + fakeNow,
    sleep: async (ms) => {
      fakeNow += ms;
    },
  });
  let n = 0;
  const consents = createConsentStore({ now: () => new Date(), newToken: () => `consent-${++n}-${++counter}` });
  const handlers: Record<string, SucceededHandler> = {};
  const generation = createGenerationService({
    db,
    comfy,
    store,
    workflows,
    consents,
    limiter: createLimiter(3),
    clock,
    handlers,
  });
  const transport = createMcpUploadTransport(session, workflows.upload);
  const sendAsset = createCloudAssetSender({
    transport,
    readBytes: async (asset) => {
      const row = findAsset(db, asset.id);
      if (!row) throw new Error(`找不到檔案：${asset.id}`);
      return store.read(row.path);
    },
  });
  const writer = createFakeWriter(options.writerResponses ?? echoWriterResponse);

  db.insert(temples)
    .values({
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
      foundedRaw: '',
      rebuiltRaw: '',
    })
    .run();
  db.insert(temples)
    .values({
      id: 't2',
      name: '淡水福佑宮',
      nameNormalized: '淡水福佑宮',
      flags: [],
      status: 'active',
      district: '淡水區',
      address: '新北市淡水區中正路 200 號',
      phoneRaw: '',
      deity: '天上聖母',
      religion: '道教',
      foundedRaw: '',
      rebuiltRaw: '',
    })
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
  // 預設門檻 1000 點；Nano Banana Pro 的單價待實測，所以仍一定要同意
  updateSettings(db, { consentThresholdCredits: 1000 });

  return {
    db,
    fake,
    store,
    assetsDir,
    clock,
    workflows,
    consents,
    generation,
    writer,
    transport,
    sendAsset,
    handlers,
    prompts: loadPromptFiles(promptsDir),
    seriesId: 's1',
    templeId: 't1',
    async close() {
      await fake.close();
      rmSync(assetsDir, { recursive: true, force: true });
    },
  };
}

/** 新增一支影片（模型帶入系列預設） */
export function addVideo(world: World, input: { id: string; templeId?: string; seriesId?: string; imageModel?: string }): string {
  world.db
    .insert(videos)
    .values({
      id: input.id,
      seriesId: input.seriesId ?? world.seriesId,
      templeId: input.templeId ?? world.templeId,
      stage: 'creating',
      imageModel: input.imageModel ?? 'nano-banana-pro',
      videoModel: 'gemini-omni-1.1-flash',
      createdAt: 'x',
      updatedAt: 'x',
    })
    .run();
  return input.id;
}

/** 新增一張寺廟照片：原圖與去識別圖分開存（內容不同），回傳照片與兩個資產編號 */
export type PhotoTarget = Pick<World, 'db' | 'store' | 'seriesId' | 'templeId'> & { clock: Clock };

export function addPhoto(world: PhotoTarget, input: { viewKey: string | null; templeId?: string }) {
  counter += 1;
  const originalId = `original-${counter}`;
  const deidId = `deid-${counter}`;
  const original = world.store.save({ id: originalId, kind: 'original_photo', mime: 'image/png', bytes: ORIGINAL_BYTES });
  insertAsset(world.db, { id: originalId, kind: 'original_photo', mime: 'image/png', path: original.path, sha256: original.sha256 });
  const deid = world.store.save({ id: deidId, kind: 'deid_photo', mime: 'image/png', bytes: DEID_BYTES });
  insertAsset(world.db, { id: deidId, kind: 'deid_photo', mime: 'image/png', path: deid.path, sha256: deid.sha256 });
  const photo = insertPhoto(
    world.db,
    {
      seriesId: world.seriesId,
      templeId: input.templeId ?? world.templeId,
      videoId: null,
      originalAssetId: originalId,
      deidentifiedAssetId: deidId,
      viewKey: input.viewKey,
      deidBoxes: [],
    },
    world.clock,
  );
  return { photo, originalSha256: original.sha256, deidSha256: deid.sha256 };
}
