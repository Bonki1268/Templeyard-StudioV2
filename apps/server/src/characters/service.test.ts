import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seriesConsentScope } from '../costs/consents.js';
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
      .values({ id: 's2', name: '另一個系列', visualStyle: '寫實', direction: '歷史故事', defaultImageModel: 'nano-banana-pro', defaultVideoModel: 'gemini-omni-1.1-flash', createdAt: 'x', updatedAt: 'x' })
      .run();
    addVideo(world, { id: 'v3', seriesId: 's2' });
    expect(characters.listForVideo('v3')).toEqual([]);
  });
});

// 使用者 2026-11-05 提出：系列設定的角色庫（新增、修改、產生定裝圖）
describe('系列角色庫', () => {
  const grandpa = { name: '阿公', description: '戴斗笠、白鬍子', continuityLocks: ['straw hat'] };

  function seriesConsent(units = 2) {
    return world.consents.issue(seriesConsentScope('s1'), [{ model: 'nano-banana-pro', units }]).token;
  }

  it('新增系列角色：屬於系列、不屬於任何影片，第 1 版用系列的預設圖片模型，等待產生定裝圖', () => {
    const created = characters.createForSeries('s1', grandpa);

    expect(created).toMatchObject({
      name: '阿公',
      isSeries: true,
      seriesId: 's1',
      videoId: null,
      state: 'draft',
      version: { version: 1, description: '戴斗笠、白鬍子', continuityLocks: ['straw hat'], imageModel: 'nano-banana-pro', sheetAssetId: null, lookAssetId: null },
    });
  });

  it('同系列已經有同名的系列角色：409', async () => {
    characters.createForSeries('s1', grandpa);
    await expectStudioError(() => characters.createForSeries('s1', { ...grandpa, description: '另一個' }), 409, '這個系列已經有角色「阿公」');
  });

  it('從影片設為系列角色的同名角色也算', async () => {
    const id = grandma();
    await generated(id);
    characters.confirm(id);
    characters.setSeries(id);
    await expectStudioError(() => characters.createForSeries('s1', { name: '阿嬤', description: '另一個阿嬤' }), 409, '這個系列已經有角色「阿嬤」');
  });

  it('系列不存在：404', async () => {
    await expectStudioError(() => characters.createForSeries('nope', grandpa), 404, '找不到這個系列');
  });

  it('角色庫只列出這個系列的系列角色：不含影片專屬角色與其他系列的角色', async () => {
    grandma();
    const created = characters.createForSeries('s1', grandpa);
    world.db
      .insert(series)
      .values({ id: 's2', name: '另一個系列', visualStyle: '寫實', direction: '歷史故事', defaultImageModel: 'nano-banana-pro', defaultVideoModel: 'gemini-omni-1.1-flash', createdAt: 'x', updatedAt: 'x' })
      .run();
    characters.createForSeries('s2', { name: '小明', description: '國中生' });

    expect(characters.listForSeries('s1').map((c) => c.id)).toEqual([created.id]);
  });

  it('同系列的影片可以沿用角色庫的角色；方案裡同名的角色對應到它', () => {
    const created = characters.createForSeries('s1', grandpa);

    expect(characters.listForVideo('v1').map((c) => c.id)).toEqual([created.id]);
    expect(characters.resolve('v1', [{ name: '阿公' }]).get('阿公')).toBe(created.id);
  });

  it('沒有指定影片時，用系列的預設圖片模型產生三視圖與定裝圖；生成紀錄不屬於任何影片', async () => {
    const created = characters.createForSeries('s1', grandpa);

    const outcome = await characters.generate(created.id, null, seriesConsent());
    expect(outcome.status).toBe('accepted');
    await settleAll();

    const rows = world.db.select().from(generations).all();
    expect(rows.map((r) => [r.node, r.videoId, r.model !== '']).sort()).toEqual([
      [CHARACTER_LOOK_NODE, null, true],
      [CHARACTER_SHEET_NODE, null, true],
    ]);
    expect(characters.listForSeries('s1')[0]).toMatchObject({ state: 'pending_confirm' });
    expect(characters.confirm(created.id).state).toBe('confirmed');
  });

  it('沒有指定影片時，影片的同意憑證不能用', async () => {
    const created = characters.createForSeries('s1', grandpa);

    const outcome = await characters.generate(created.id, null, consent('v1'));

    expect(outcome.status).toBe('consent_required');
    expect(world.db.select().from(generations).all()).toEqual([]);
  });

  it('沒有指定影片時，影片專屬角色不能產生：400', async () => {
    const id = grandma();
    await expectStudioError(() => characters.generate(id, null, seriesConsent()), 400, '請指定是哪一支影片');
  });

  it('修改已確認的系列角色：另存新版本，要重新產生定裝圖', async () => {
    const created = characters.createForSeries('s1', grandpa);
    await characters.generate(created.id, null, seriesConsent());
    await settleAll();
    characters.confirm(created.id);

    const changed = characters.update(created.id, { description: '戴斗笠、白鬍子、拄拐杖', continuityLocks: ['straw hat', 'wooden cane'] });

    expect(changed).toMatchObject({ isSeries: true, state: 'draft', version: { version: 2, sheetAssetId: null, lookAssetId: null } });
  });
});

// 第 14 階段：角色詳情（身份錨點與造型、版本說明、分別重生、影片保存的系列設定）
describe('身份錨點與造型', () => {
  const base = { name: '阿嬤', continuityLocks: ['navy blouse'] };

  function seriesConsent14(units = 2) {
    return world.consents.issue(seriesConsentScope('s1'), [{ model: 'nano-banana-pro', units }]).token;
  }

  async function confirmedGrandma() {
    const created = characters.createForSeries('s1', { ...base, identityAnchors: '七十歲、短白髮', look: '深藍布衫' });
    await characters.generate(created.id, null, seriesConsent14());
    await settleAll();
    return characters.confirm(created.id);
  }

  it('新增角色：外觀描述由身份錨點與造型組成', () => {
    const created = characters.createForSeries('s1', { ...base, identityAnchors: '七十歲、短白髮', look: '深藍布衫' });
    expect(created.version).toMatchObject({ description: '七十歲、短白髮；深藍布衫', identityAnchors: '七十歲、短白髮', look: '深藍布衫' });
  });

  it('新增角色：只給外觀描述（舊寫法）時照存，身份錨點與造型留空', () => {
    const created = characters.createForSeries('s1', { name: '阿公', description: '戴斗笠' });
    expect(created.version).toMatchObject({ description: '戴斗笠', identityAnchors: null, look: null });
  });

  it('新增角色：外觀描述、身份錨點、造型都沒有：400', () => {
    expect(() => characters.createForSeries('s1', { name: '阿公' })).toThrowError(/請填寫角色的外觀描述/);
  });

  it('未確認的角色：修改身份錨點與造型，直接更新同一版，外觀描述重新組成', () => {
    const created = characters.createForSeries('s1', { ...base, identityAnchors: '七十歲', look: '深藍布衫' });
    const changed = characters.update(created.id, { identityAnchors: '八十歲、白髮盤髻', look: '墨綠布衫', continuityLocks: ['green blouse'] });
    expect(changed.version).toMatchObject({
      version: 1,
      id: created.version.id,
      description: '八十歲、白髮盤髻；墨綠布衫',
      identityAnchors: '八十歲、白髮盤髻',
      look: '墨綠布衫',
      continuityLocks: ['green blouse'],
    });
  });

  it('已確認的角色：修改造型另存新版本，並記下和上一版的差別；身份錨點沒傳就沿用', async () => {
    const confirmed = await confirmedGrandma();
    const changed = characters.update(confirmed.id, { look: '灰色毛線外套', continuityLocks: ['navy blouse'] });
    expect(changed.version).toMatchObject({
      version: 2,
      identityAnchors: '七十歲、短白髮',
      look: '灰色毛線外套',
      description: '七十歲、短白髮；灰色毛線外套',
      changeNote: '和 v1 的差別：造型有修改',
      sheetAssetId: null,
      lookAssetId: null,
      confirmedAt: null,
    });
    expect(changed.state).toBe('draft');
  });

  it('舊資料（只有外觀描述）修改造型：身份錨點留空，外觀描述只剩造型', () => {
    const created = characters.createForSeries('s1', { name: '阿公', description: '戴斗笠' });
    const changed = characters.update(created.id, { look: '戴草帽', continuityLocks: [] });
    expect(changed.version).toMatchObject({ description: '戴草帽', look: '戴草帽' });
  });

  it('連續性鎖超過 10 條：400', () => {
    const created = characters.createForSeries('s1', { ...base, identityAnchors: '七十歲', look: '深藍布衫' });
    const tooMany = Array.from({ length: 11 }, (_, i) => `lock ${i}`);
    expect(() => characters.update(created.id, { look: '深藍布衫', continuityLocks: tooMany })).toThrow();
  });

  it('三視圖與定裝圖的指令帶上組成後的外觀描述', async () => {
    const created = characters.createForSeries('s1', { ...base, identityAnchors: '七十歲、短白髮', look: '深藍布衫' });
    await characters.generate(created.id, null, seriesConsent14());
    await settleAll();
    expect(world.writer.calls.map((c) => c.content).join('\n')).toContain('七十歲、短白髮；深藍布衫');
  });
});

describe('分別重生三視圖或定裝圖', () => {
  const grandpaInput = { name: '阿公', description: '戴斗笠', continuityLocks: ['straw hat'] };

  function seriesConsent14(units: number) {
    return world.consents.issue(seriesConsentScope('s1'), [{ model: 'nano-banana-pro', units }]).token;
  }

  async function generatedGrandpa() {
    const created = characters.createForSeries('s1', grandpaInput);
    await characters.generate(created.id, null, seriesConsent14(2));
    await settleAll();
    return created.id;
  }

  it('part=sheet 只送三視圖一張，定裝圖不動；費用算 1 張', async () => {
    const id = await generatedGrandpa();
    const before = characters.listForSeries('s1')[0]?.version;
    const count = world.db.select().from(generations).all().length;

    const outcome = await characters.generate(id, null, seriesConsent14(1), 'sheet');
    expect(outcome.status).toBe('accepted');
    await settleAll();

    expect(world.db.select().from(generations).all()).toHaveLength(count + 1);
    const after = characters.listForSeries('s1')[0]?.version;
    expect(after?.lookAssetId).toBe(before?.lookAssetId);
    expect(after?.sheetAssetId).not.toBeNull();
    expect(after?.sheetAssetId).not.toBe(before?.sheetAssetId);
  });

  it('part=look 只送定裝圖一張，三視圖不動', async () => {
    const id = await generatedGrandpa();
    const before = characters.listForSeries('s1')[0]?.version;
    await characters.generate(id, null, seriesConsent14(1), 'look');
    await settleAll();
    const after = characters.listForSeries('s1')[0]?.version;
    expect(after?.sheetAssetId).toBe(before?.sheetAssetId);
    expect(after?.lookAssetId).not.toBe(before?.lookAssetId);
  });

  it('只重生一張，沒有同意憑證時要先同意', async () => {
    const id = await generatedGrandpa();
    const outcome = await characters.generate(id, null, undefined, 'sheet');
    expect(outcome.status).toBe('consent_required');
  });

  it('已確認的版本重生其中一張：另存為新版本，另一張沿用原版本，原版本不變', async () => {
    const id = await generatedGrandpa();
    const confirmed = characters.confirm(id);
    const v1 = confirmed.version;

    const outcome = await characters.generate(id, null, seriesConsent14(1), 'look');
    expect(outcome.status).toBe('accepted');
    await settleAll();

    const [current] = characters.listForSeries('s1');
    expect(current?.version).toMatchObject({
      version: 2,
      sheetAssetId: v1.sheetAssetId,
      confirmedAt: null,
      changeNote: '和 v1 的差別：重新產生定裝圖',
    });
    expect(current?.version.lookAssetId).not.toBe(v1.lookAssetId);
  });

  it('已確認的版本不帶 part 重生兩張：仍是 409「已經確認」，要改請先修改外觀', async () => {
    const id = await generatedGrandpa();
    characters.confirm(id);
    await expectStudioError(() => characters.generate(id, null, seriesConsent14(2)), 409, '「阿公」已經確認；要修改請先改外觀描述');
  });
});

describe('影片保存的系列設定', () => {
  it('影片有保存的系列設定時，定裝圖指令用保存的視覺風格，不用系列目前的', async () => {
    world.db.run(
      sql`UPDATE videos SET series_snapshot = ${JSON.stringify({
        visualStyle: '建立影片當時的視覺風格',
        direction: '歷史故事',
        defaultImageModel: 'nano-banana-pro',
        defaultVideoModel: 'gemini-omni-1.1-flash',
        questionnaireDefaults: null,
      })} WHERE id = 'v1'`,
    );
    world.db.update(series).set({ visualStyle: '系列改版後的視覺風格' }).where(eq(series.id, 's1')).run();
    const id = grandma();

    await generated(id);

    const prompts = world.db
      .select()
      .from(generations)
      .all()
      .map((row) => JSON.stringify(row.call));
    expect(world.writer.calls.map((c) => c.content).join('\n')).toContain('建立影片當時的視覺風格');
    expect(world.writer.calls.map((c) => c.content).join('\n')).not.toContain('系列改版後的視覺風格');
    expect(prompts).toHaveLength(2);
  });

  it('影片沒有保存的系列設定（舊資料）時，用系列目前的視覺風格', async () => {
    world.db.update(series).set({ visualStyle: '系列目前的視覺風格' }).where(eq(series.id, 's1')).run();
    await generated(grandma());
    expect(world.writer.calls.map((c) => c.content).join('\n')).toContain('系列目前的視覺風格');
  });
});
