import { planChangeInvalidations, type InvalidationChange, type PromptFile, type ShotDetail } from '@templeyard/shared';
import { eq } from 'drizzle-orm';
import { CHARACTER_LOOK_NODE, CHARACTER_SHEET_NODE, createCharacterService, type CharacterService } from '../../characters/service.js';
import { generations, videos } from '../../db/schema.js';
import { insertPlan } from '../../plans/repository.js';
import { createPlanService, type PlanService } from '../../plans/service.js';
import { addPhoto, addVideo, createWorld, type World } from '../../templeBoards/__fixtures__/world.js';
import { TEMPLE_VIEW_NODE, createTempleBoardService } from '../../templeBoards/service.js';
import { FRAME_NODES, createFrameService, type FrameService } from '../service.js';

// 精緻圖與細修測試共用：定裝版已確認（廟前全景）、阿嬤已確認、方案第 1 版 4 格（第 2、4 格有阿嬤，第 1 格對應照片）

export type FramesWorld = {
  world: World;
  characters: CharacterService;
  plans: PlanService;
  frames: FrameService;
  grandmaId: string;
  photo: ReturnType<typeof addPhoto>;
  consent(units: number): string;
  settleAll(): Promise<void>;
  /** 用另一份生成指令（例如更新過的 refined-frame）重新建立精緻圖服務 */
  framesWith(prompts: ReadonlyMap<string, PromptFile>): FrameService;
  /** 精緻圖服務送出的變動（失效規則、首格換了），第 11 階段的影片服務接在這裡 */
  onFrameChange: ((videoId: string, change: InvalidationChange) => void)[];
  /** 細修頁讀這一格的影片（第 11 階段的影片服務接在這裡） */
  clipLookup: { current: ((videoId: string, shotKey: string) => ShotDetail['clip']) | null };
  close(): Promise<void>;
};

export async function createFramesWorld(): Promise<FramesWorld> {
  const world = await createWorld();
  addVideo(world, { id: 'v1' });
  const photo = addPhoto(world, { viewKey: 'front_overview' });
  const consent = (units: number) => world.consents.issue('v1', [{ model: 'nano-banana-pro', units }]).token;
  const settleAll = async () => {
    const rows = world.db.select().from(generations).all();
    await Promise.all(rows.map((row) => world.generation.whenSettled(row.id)));
  };

  const boards = createTempleBoardService({
    db: world.db,
    clock: world.clock,
    workflows: world.workflows,
    prompts: world.prompts,
    store: world.store,
    generation: { service: world.generation, writer: world.writer, sendAsset: world.sendAsset },
  });
  world.handlers[TEMPLE_VIEW_NODE] = boards.handleGenerated;
  await boards.generate('v1', { inferredViewKeys: [], consentToken: consent(1) });
  await settleAll();
  boards.confirm('v1');

  const characters = createCharacterService({
    db: world.db,
    clock: world.clock,
    workflows: world.workflows,
    prompts: world.prompts,
    generation: { service: world.generation, writer: world.writer },
  });
  world.handlers[CHARACTER_SHEET_NODE] = characters.handleGenerated;
  world.handlers[CHARACTER_LOOK_NODE] = characters.handleGenerated;
  const grandmaId = characters.resolve('v1', [{ name: '阿嬤', description: '七十多歲的在地阿嬤', continuityLocks: ['grey cotton cardigan'] }]).get('阿嬤') ?? '';
  await characters.generate(grandmaId, 'v1', consent(2));
  await settleAll();
  characters.confirm(grandmaId);

  const base = {
    shotSize: '中景' as const,
    cameraMove: '固定',
    cameraSpeed: '',
    cameraAngle: '平視',
    actionEnd: '',
    viewKey: 'front_overview',
    lighting: '清晨',
    dialogue: '',
    speaker: '',
    subtitle: '',
    photoId: null as string | null,
    keyframesEnabled: false,
    keyframeTimes: [] as number[],
    customPrompt: null,
    factSources: [],
    dialogueEstimateSec: null,
  };
  insertPlan(
    world.db,
    { id: 'plan-1', videoId: 'v1', version: 1, styleNote: '溫暖', source: 'agent', diff: { changedShotKeys: [], summary: '' }, createdAt: 'x' },
    [
      { ...base, id: 's1', shotKey: 'k1', seq: 1, startSec: 0, durationSec: 6, description: '廟前全景', actionStart: '廟埕空無一人', characters: [], photoId: photo.photo.id },
      { ...base, id: 's2', shotKey: 'k2', seq: 2, startSec: 6, durationSec: 8, description: '阿嬤在廟埕', actionStart: '阿嬤雙手合十', characters: [grandmaId], dialogue: '媽祖婆保佑大家平安。' },
      { ...base, id: 's3', shotKey: 'k3', seq: 3, startSec: 14, durationSec: 2, description: '香爐', actionStart: '香煙升起', characters: [] },
      { ...base, id: 's4', shotKey: 'k4', seq: 4, startSec: 16, durationSec: 10, description: '阿嬤走進廟裡', actionStart: '阿嬤站在門口', actionEnd: '阿嬤走到神案前', characters: [grandmaId] },
    ],
  );
  world.db.update(videos).set({ stage: 'plan' }).where(eq(videos.id, 'v1')).run();

  let frames: FrameService | null = null;
  const onFrameChange: ((videoId: string, change: InvalidationChange) => void)[] = [];
  const clipLookup: FramesWorld['clipLookup'] = { current: null };
  const plans = createPlanService({
    db: world.db,
    clock: world.clock,
    workflows: world.workflows,
    prompts: world.prompts,
    model: null,
    characters,
    onVersionSaved: (videoId, previous, next) => {
      for (const change of planChangeInvalidations(previous, next.shots, next.diff.changedShotKeys)) frames?.invalidate(videoId, change);
    },
  });
  const framesWith = (prompts: ReadonlyMap<string, PromptFile>) => {
    const created = createFrameService({
      db: world.db,
      clock: world.clock,
      workflows: world.workflows,
      prompts,
      plans,
      characters,
      generation: { service: world.generation, writer: world.writer, sendAsset: world.sendAsset },
      onChange: (videoId, change) => {
        for (const listener of onFrameChange) listener(videoId, change);
      },
      clipOf: (videoId, shotKey) => clipLookup.current?.(videoId, shotKey) ?? null,
    });
    for (const node of FRAME_NODES) world.handlers[node] = created.handleGenerated;
    return created;
  };
  frames = framesWith(world.prompts);

  return { world, characters, plans, frames, grandmaId, photo, consent, settleAll, framesWith, onFrameChange, clipLookup, close: () => world.close() };
}
