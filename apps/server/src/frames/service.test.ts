import { createPlanVersionSchema, planChangeInvalidations, type Plan } from '@templeyard/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CHARACTER_LOOK_NODE, CHARACTER_SHEET_NODE, createCharacterService, type CharacterService } from '../characters/service.js';
import { frames as framesTable, generations, videos } from '../db/schema.js';
import { insertPlan } from '../plans/repository.js';
import { createPlanService, type PlanService } from '../plans/service.js';
import { StudioError } from '../studio/errors.js';
import { addPhoto, addVideo, createWorld, type World } from '../templeBoards/__fixtures__/world.js';
import { TEMPLE_VIEW_NODE, createTempleBoardService } from '../templeBoards/service.js';
import { REFINED_FRAME_NODE, createFrameService, type FrameService } from './service.js';

let world: World;
let characters: CharacterService;
let plans: PlanService;
let frames: FrameService;
let grandmaId: string;
let photo: ReturnType<typeof addPhoto>;

function consent(units: number) {
  return world.consents.issue('v1', [{ model: 'nano-banana-pro', units }]).token;
}

async function settleAll() {
  const rows = world.db.select().from(generations).all();
  await Promise.all(rows.map((row) => world.generation.whenSettled(row.id)));
}

function service(withGeneration = true): FrameService {
  const created = createFrameService({
    db: world.db,
    clock: world.clock,
    workflows: world.workflows,
    prompts: world.prompts,
    plans,
    characters,
    generation: withGeneration ? { service: world.generation, writer: world.writer, sendAsset: world.sendAsset } : null,
    unavailableMessage: '還沒設定生成服務',
  });
  world.handlers[REFINED_FRAME_NODE] = created.handleGenerated;
  return created;
}

async function expectStudioError(run: () => unknown, status: number, message: string) {
  let caught: unknown = null;
  try {
    await run();
  } catch (error: unknown) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(StudioError);
  expect(caught).toMatchObject({ status, message });
}

/** 方案第 1 版：4 格，第 2、4 格有阿嬤；都用「廟前全景」 */
function insertPlanV1(options: { keyframesOn?: number; slow?: boolean } = {}) {
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
    photoId: null,
    keyframesEnabled: false,
    keyframeTimes: [],
    customPrompt: null,
    factSources: [],
    dialogueEstimateSec: null,
  };
  const shots = [
    { ...base, shotKey: 'k1', seq: 1, startSec: 0, durationSec: 6, description: `廟前全景${options.slow ? ' [slow]' : ''}`, actionStart: '廟埕空無一人', characters: [], photoId: photo.photo.id },
    { ...base, shotKey: 'k2', seq: 2, startSec: 6, durationSec: 8, description: '阿嬤在廟埕', actionStart: '阿嬤雙手合十', characters: [grandmaId] },
    { ...base, shotKey: 'k3', seq: 3, startSec: 14, durationSec: 2, description: '香爐', actionStart: '香煙升起', characters: [] },
    { ...base, shotKey: 'k4', seq: 4, startSec: 16, durationSec: 10, description: '阿嬤走進廟裡', actionStart: '阿嬤站在門口', actionEnd: '阿嬤走到神案前', characters: [grandmaId] },
  ].map((shot, index) => ({ ...shot, id: `shot-row-${index}`, keyframesEnabled: options.keyframesOn === shot.seq }));
  insertPlan(world.db, { id: 'plan-1', videoId: 'v1', version: 1, styleNote: '溫暖', source: 'agent', diff: { changedShotKeys: [], summary: '' }, createdAt: 'x' }, shots);
  world.db.update(videos).set({ stage: 'plan' }).where(eq(videos.id, 'v1')).run();
}

beforeEach(async () => {
  world = await createWorld();
  addVideo(world, { id: 'v1' });
  photo = addPhoto(world, { viewKey: 'front_overview' });
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

  characters = createCharacterService({
    db: world.db,
    clock: world.clock,
    workflows: world.workflows,
    prompts: world.prompts,
    generation: { service: world.generation, writer: world.writer },
  });
  world.handlers[CHARACTER_SHEET_NODE] = characters.handleGenerated;
  world.handlers[CHARACTER_LOOK_NODE] = characters.handleGenerated;
  grandmaId = characters.resolve('v1', [{ name: '阿嬤', description: '七十多歲的在地阿嬤', continuityLocks: ['grey cotton cardigan'] }]).get('阿嬤') ?? '';
  await characters.generate(grandmaId, 'v1', consent(2));
  await settleAll();
  characters.confirm(grandmaId);

  plans = createPlanService({ db: world.db, clock: world.clock, workflows: world.workflows, prompts: world.prompts, model: null, characters });
  frames = service();
});

afterEach(async () => {
  await world.close();
});

describe('還沒生成', () => {
  it('列出每一格，還沒有精緻圖', () => {
    insertPlanV1();
    const response = frames.get('v1');
    expect(response).toMatchObject({ generating: false, generatingLabel: null });
    expect(response.shots.map((s) => [s.seq, s.first, s.last, s.needsLast])).toEqual([
      [1, null, null, false],
      [2, null, null, false],
      [3, null, null, false],
      [4, null, null, false],
    ]);
  });

  it('影片不存在：404', async () => {
    await expectStudioError(() => frames.get('nope'), 404, '找不到這支影片');
  });
});

describe('生成精緻圖', () => {
  it('沒有同意憑證：需要同意，不送出', async () => {
    insertPlanV1();
    const before = world.db.select().from(generations).all().length;
    const outcome = await frames.generate('v1', null);
    expect(outcome.status).toBe('consent_required');
    expect(world.db.select().from(generations).all()).toHaveLength(before);
    expect(world.db.select().from(framesTable).all()).toEqual([]);
  });

  it('每格一張首格；生成中只說內容類型，影片進到生成中；全部完成後進到精緻圖', async () => {
    insertPlanV1();

    const outcome = await frames.generate('v1', consent(4));

    expect(outcome).toMatchObject({ status: 'accepted', frames: { generating: true, generatingLabel: '精緻圖・4 格' } });
    expect(world.db.select().from(videos).where(eq(videos.id, 'v1')).get()?.stage).toBe('frames_generating');
    await settleAll();
    const done = frames.get('v1');
    expect(done.generating).toBe(false);
    expect(done.shots.every((s) => s.first?.state === 'ready' && s.first.assetId !== null && s.last === null)).toBe(true);
    expect(world.db.select().from(videos).where(eq(videos.id, 'v1')).get()?.stage).toBe('frames');
  });

  it('開啟中間關鍵畫格的格子另外產生末格（要同意 5 張）', async () => {
    insertPlanV1({ keyframesOn: 4 });
    expect((await frames.generate('v1', consent(4))).status).toBe('consent_required');
    expect((await frames.generate('v1', consent(5))).status).toBe('accepted');
    await settleAll();
    const shot4 = frames.get('v1').shots[3];
    expect(shot4).toMatchObject({ needsLast: true, last: { kind: 'last', state: 'ready' } });
  });

  it('角色出現的格子：最終指令有角色的連續性鎖；沒有角色的格子沒有', async () => {
    insertPlanV1();
    await frames.generate('v1', consent(4));
    await settleAll();
    const rows = world.db.select().from(generations).all().filter((r) => r.node === REFINED_FRAME_NODE);
    const promptOf = (shotKey: string) => String(rows.find((r) => r.target.shotKey === shotKey)?.input.prompt);
    expect(promptOf('k2')).toContain('grey cotton cardigan');
    expect(promptOf('k1')).not.toContain('grey cotton cardigan');
  });

  it('參考圖：角色定裝圖、這一格的定裝版視角圖與對應照片的去識別圖；原圖一次都不上傳', async () => {
    insertPlanV1();
    const look = characters.listForVideo('v1')[0]?.version.lookAssetId;
    await frames.generate('v1', consent(4));
    await settleAll();

    const uploaded = world.fake.uploads.map((u) => u.filename);
    expect(uploaded).toContain(`${look}.png`);
    expect(uploaded).toContain(`${photo.photo.deidentifiedAssetId}.png`);
    expect(world.fake.uploads.map((u) => u.sha256)).not.toContain(photo.originalSha256);
    const rows = world.db.select().from(generations).all().filter((r) => r.node === REFINED_FRAME_NODE);
    const refsOf = (shotKey: string) => rows.find((r) => r.target.shotKey === shotKey)?.input.references;
    expect(refsOf('k2')).toHaveLength(2);
    expect(refsOf('k1')).toHaveLength(2);
    expect(refsOf('k3')).toHaveLength(1);
  });

  it('角色還沒確認：409，說明第一個原因', async () => {
    insertPlanV1();
    characters.update(grandmaId, { description: '戴斗笠的阿嬤', continuityLocks: ['straw hat'] });
    await expectStudioError(() => frames.generate('v1', consent(4)), 409, '還不能生成：角色「阿嬤」還沒確認定裝圖');
  });

  it('已經在生成：409', async () => {
    insertPlanV1();
    await frames.generate('v1', consent(4));
    await expectStudioError(() => frames.generate('v1', consent(4)), 409, '精緻圖還在生成中');
    await settleAll();
  });

  it('沒有方案：409', async () => {
    await expectStudioError(() => frames.generate('v1', consent(4)), 409, '還沒有分鏡方案');
  });

  it('沒有設定生成服務：503', async () => {
    insertPlanV1();
    await expectStudioError(() => service(false).generate('v1', consent(4)), 503, '還沒設定生成服務');
  });

  it('重新建立服務（例如重啟）後仍知道生成中，完成後照樣接上結果', async () => {
    insertPlanV1({ slow: true });
    await frames.generate('v1', consent(4));
    const restarted = service();
    expect(restarted.get('v1').generating).toBe(true);
    await settleAll();
    expect(restarted.get('v1').shots.every((s) => s.first?.state === 'ready')).toBe(true);
  });
});

describe('確認與重生', () => {
  beforeEach(async () => {
    insertPlanV1();
    await frames.generate('v1', consent(4));
    await settleAll();
  });

  it('確認這一格', () => {
    const response = frames.confirm('v1', 'k1');
    expect(response.shots[0]?.first?.selected).toBe(true);
    expect(response.shots[1]?.first?.selected).toBe(false);
  });

  it('方案沒有這一格：404', async () => {
    await expectStudioError(() => frames.confirm('v1', 'nope'), 404, '方案沒有這一格');
  });

  it('單格重生：產生新的一張（舊的保留），要重新確認；其他格不受影響', async () => {
    frames.confirm('v1', 'k1');
    frames.confirm('v1', 'k2');
    const before = frames.get('v1').shots[1]?.first?.id;

    expect((await frames.regenerate('v1', 'k2', 'first', consent(1))).status).toBe('accepted');
    await settleAll();

    const shots = frames.get('v1').shots;
    expect(shots[1]?.first?.id).not.toBe(before);
    expect(shots[1]?.first?.selected).toBe(false);
    expect(shots[0]?.first?.selected).toBe(true);
    expect(world.db.select().from(framesTable).all()).toHaveLength(5);
  });

  it('重生沒有同意憑證：需要同意', async () => {
    expect((await frames.regenerate('v1', 'k2', 'first', null)).status).toBe('consent_required');
  });

  it('還在生成中的格子不能確認', async () => {
    await frames.regenerate('v1', 'k3', 'first', consent(1));
    await expectStudioError(() => frames.confirm('v1', 'k3'), 409, '第 3 格的精緻圖還沒產生完成');
    await settleAll();
  });
});

describe('失效規則', () => {
  beforeEach(async () => {
    insertPlanV1();
    await frames.generate('v1', consent(4));
    await settleAll();
    for (const key of ['k1', 'k2', 'k3', 'k4']) frames.confirm('v1', key);
  });

  it('卡片改了：該格的精緻圖需重新確認，其他格不受影響', () => {
    frames.invalidate('v1', { type: 'shot', shotKey: 'k2', durationChanged: false });
    const shots = frames.get('v1').shots;
    expect(shots.map((s) => s.first?.needsReconfirm)).toEqual([false, true, false, false]);
  });

  it('角色改了：這個角色出現的格子需重新確認', () => {
    frames.invalidate('v1', { type: 'character', characterName: '阿嬤' });
    expect(frames.get('v1').shots.map((s) => s.first?.needsReconfirm)).toEqual([false, true, false, true]);
  });

  it('寺廟定裝版有新版本：用到這個視角的格子需重新確認', () => {
    frames.invalidate('v1', { type: 'templeBoard', viewKeys: ['front_overview'] });
    expect(frames.get('v1').shots.every((s) => s.first?.needsReconfirm)).toBe(true);
  });

  it('重新確認後解除', () => {
    frames.invalidate('v1', { type: 'shot', shotKey: 'k2', durationChanged: false });
    expect(frames.confirm('v1', 'k2').shots[1]?.first).toMatchObject({ selected: true, needsReconfirm: false });
  });

  it('方案改版時（接上方案服務的通知），改到的格子需重新確認', () => {
    const watched = createPlanService({
      db: world.db,
      clock: world.clock,
      workflows: world.workflows,
      prompts: world.prompts,
      model: null,
      characters,
      onVersionSaved: (videoId, previous, next: Plan) => {
        for (const change of planChangeFrom(previous, next)) frames.invalidate(videoId, change);
      },
    });
    const current = watched.current('v1');
    if (!current) throw new Error('沒有方案');
    const inputs = current.shots.map(({ seq: _s, startSec: _t, dialogueEstimateSec: _d, ...rest }) => rest);
    inputs[1] = { ...inputs[1]!, dialogue: '媽祖婆保佑大家平安。' };

    watched.createVersion('v1', createPlanVersionSchema.parse({ baseVersion: 1, shots: inputs }));

    expect(frames.get('v1').shots.map((s) => s.first?.needsReconfirm)).toEqual([false, true, false, false]);
  });
});


function planChangeFrom(previous: readonly { shotKey: string; durationSec: number }[], next: Plan) {
  return planChangeInvalidations(previous, next.shots, next.diff.changedShotKeys);
}
