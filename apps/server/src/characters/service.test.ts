import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generations, series } from '../db/schema.js';
import { StudioError } from '../studio/errors.js';
import { addVideo, createWorld, type World } from '../templeBoards/__fixtures__/world.js';
import { CHARACTER_LOOK_NODE, CHARACTER_SHEET_NODE, createCharacterService, type CharacterService } from './service.js';

let world: World;
let characters: CharacterService;

function service(withGeneration = true) {
  return createCharacterService({
    db: world.db,
    clock: world.clock,
    workflows: world.workflows,
    prompts: world.prompts,
    generation: withGeneration ? { service: world.generation, writer: world.writer } : null,
    unavailableMessage: '還沒設定生成服務',
  });
}

function consent(videoId = 'v1', units = 2) {
  return world.consents.issue(videoId, [{ model: 'nano-banana-pro', units }]).token;
}

async function settleAll() {
  const rows = world.db.select().from(generations).all();
  await Promise.all(rows.map((row) => world.generation.whenSettled(row.id)));
}

/** 這支影片的「阿嬤」：外觀描述與連續性鎖照 Agent 給的 */
function grandma(videoId = 'v1'): string {
  const id = characters.resolve(videoId, [{ name: '阿嬤', description: '七十多歲的在地阿嬤', continuityLocks: ['grey cotton cardigan'] }]).get('阿嬤');
  if (!id) throw new Error('沒有建立阿嬤');
  return id;
}

async function generated(id: string, videoId = 'v1') {
  const outcome = await characters.generate(id, videoId, consent(videoId));
  expect(outcome.status).toBe('accepted');
  await settleAll();
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

beforeEach(async () => {
  world = await createWorld();
  addVideo(world, { id: 'v1' });
  characters = service();
  world.handlers[CHARACTER_SHEET_NODE] = characters.handleGenerated;
  world.handlers[CHARACTER_LOOK_NODE] = characters.handleGenerated;
});

afterEach(async () => {
  await world.close();
});

describe('方案的角色名稱轉成角色', () => {
  it('建立影片專屬角色：第 1 版，外觀描述與連續性鎖照 Agent 給的，還沒產生定裝圖', () => {
    const id = grandma();
    const [character] = characters.listForVideo('v1');
    expect(character).toMatchObject({
      id,
      name: '阿嬤',
      isSeries: false,
      seriesId: null,
      videoId: 'v1',
      state: 'draft',
      version: { version: 1, description: '七十多歲的在地阿嬤', continuityLocks: ['grey cotton cardigan'], sheetAssetId: null, lookAssetId: null, imageModel: 'nano-banana-pro', confirmedAt: null },
    });
  });

  it('同一支影片同名的角色沿用，不重複建立', () => {
    const first = grandma();
    const again = characters.resolve('v1', [{ name: '阿嬤' }, { name: '阿公' }]);
    expect(again.get('阿嬤')).toBe(first);
    expect(characters.listForVideo('v1').map((c) => c.name)).toEqual(['阿嬤', '阿公']);
  });

  it('角色編號轉回名稱；找不到的編號原樣回傳（第 7 階段存的是名稱）', () => {
    const id = grandma();
    expect(characters.namesOf([id, '阿公'])).toEqual(['阿嬤', '阿公']);
  });

  it('影片不存在：404', async () => {
    await expectStudioError(() => characters.listForVideo('nope'), 404, '找不到這支影片');
  });
});

describe('修改外觀描述與連續性鎖', () => {
  it('還沒確認：直接改這一版', () => {
    const id = grandma();
    const character = characters.update(id, { description: '戴斗笠的阿嬤', continuityLocks: ['straw hat'] });
    expect(character.version).toMatchObject({ version: 1, description: '戴斗笠的阿嬤', continuityLocks: ['straw hat'] });
  });

  it('已確認：另存第 2 版，要重新產生定裝圖', async () => {
    const id = grandma();
    await generated(id);
    characters.confirm(id);

    const character = characters.update(id, { description: '戴斗笠的阿嬤', continuityLocks: ['straw hat'] });

    expect(character.version).toMatchObject({ version: 2, sheetAssetId: null, lookAssetId: null, confirmedAt: null });
    expect(character.state).toBe('draft');
  });

  it('找不到角色：404', async () => {
    await expectStudioError(() => characters.update('nope', { description: 'x', continuityLocks: [] }), 404, '找不到這個角色');
  });
});

describe('產生三視圖與定裝圖', () => {
  it('沒有同意憑證：需要同意，不送出', async () => {
    const id = grandma();
    const outcome = await characters.generate(id, 'v1', null);
    expect(outcome.status).toBe('consent_required');
    expect(world.db.select().from(generations).all()).toEqual([]);
  });

  it('同意 2 張後同一批送出三視圖與定裝圖，只用文字；完成後等使用者確認', async () => {
    const id = grandma();

    const outcome = await characters.generate(id, 'v1', consent());

    expect(outcome).toMatchObject({ status: 'accepted', character: { state: 'generating' } });
    const rows = world.db.select().from(generations).all();
    expect(rows.map((r) => r.node).sort()).toEqual([CHARACTER_LOOK_NODE, CHARACTER_SHEET_NODE].sort());
    expect(rows.every((r) => r.model === 'vertexai/nano-banana-pro')).toBe(true);
    expect(world.fake.uploads).toEqual([]);
    await settleAll();
    const [character] = characters.listForVideo('v1');
    expect(character?.state).toBe('pending_confirm');
    expect(character?.version.sheetAssetId).not.toBeNull();
    expect(character?.version.lookAssetId).not.toBeNull();
  });

  it('連續性鎖逐字帶進三視圖與定裝圖的最終指令', async () => {
    const id = grandma();
    await generated(id);

    const prompts = world.db
      .select()
      .from(generations)
      .all()
      .map((row) => String(row.input.prompt));
    expect(prompts).toHaveLength(2);
    for (const prompt of prompts) expect(prompt).toContain('grey cotton cardigan');
    expect(world.writer.calls.map((c) => c.content).join('\n')).toContain('阿嬤');
  });

  it('外觀描述空白：400', async () => {
    const id = characters.resolve('v1', [{ name: '阿公' }]).get('阿公') ?? '';
    await expectStudioError(() => characters.generate(id, 'v1', consent()), 400, '請填寫角色的外觀描述');
  });

  it('沒有設定生成服務：503', async () => {
    const id = grandma();
    await expectStudioError(() => service(false).generate(id, 'v1', consent()), 503, '還沒設定生成服務');
  });
});

describe('確認與設為系列角色', () => {
  it('定裝圖還沒產生完成：不能確認', async () => {
    const id = grandma();
    await expectStudioError(() => characters.confirm(id), 409, '「阿嬤」的定裝圖還沒產生完成');
  });

  it('確認後鎖定這一版', async () => {
    const id = grandma();
    await generated(id);
    const character = characters.confirm(id);
    expect(character.state).toBe('confirmed');
    expect(character.version.confirmedAt).not.toBeNull();
  });

  it('還沒確認不能設為系列角色', async () => {
    const id = grandma();
    await expectStudioError(() => characters.setSeries(id), 409, '請先確認「阿嬤」的定裝圖');
  });

  it('設為系列角色後，同系列的另一支影片沿用同名角色（已確認），不另外建立', async () => {
    const id = grandma();
    await generated(id);
    characters.confirm(id);

    const series = characters.setSeries(id);
    expect(series).toMatchObject({ isSeries: true, seriesId: 's1' });

    addVideo(world, { id: 'v2', templeId: 't2' });
    expect(characters.resolve('v2', [{ name: '阿嬤' }]).get('阿嬤')).toBe(id);
    expect(characters.listForVideo('v2')).toEqual([expect.objectContaining({ id, state: 'confirmed', isSeries: true })]);
  });

  it('其他系列看不到這個系列角色', async () => {
    const id = grandma();
    await generated(id);
    characters.confirm(id);
    characters.setSeries(id);
    world.db
      .insert(series)
      .values({ id: 's2', name: '另一個系列', visualStyle: '寫實', durationSec: 30, direction: '歷史故事', defaultImageModel: 'nano-banana-pro', defaultVideoModel: 'gemini-omni-1.1-flash', createdAt: 'x', updatedAt: 'x' })
      .run();
    addVideo(world, { id: 'v3', seriesId: 's2' });
    expect(characters.listForVideo('v3')).toEqual([]);
  });
});
