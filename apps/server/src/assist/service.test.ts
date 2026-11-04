import { assistRequestSchema, type AssistRequest } from '@templeyard/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { aiAssistLogs, generations, videos } from '../db/schema.js';
import { addVideo, createStudioWorld, type StudioWorld } from '../studio/__fixtures__/studio.js';
import { StudioError } from '../studio/errors.js';
import { createAssistService, type AssistService } from './service.js';

let world: StudioWorld;
let assist: AssistService;

const suggest = (request: AssistRequest) => assist.suggest(assistRequestSchema.parse(request));

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
  world = await createStudioWorld();
  addVideo(world, { id: 'v1', userTempleNotes: '清代由漳州移民建廟', creativeInput: '講媽祖顯靈救漁民的故事' });
  assist = createAssistService({ db: world.db, clock: world.clock, prompts: world.prompts, model: world.model });
});

afterEach(async () => {
  await world.close();
});

describe('產生 AI 建議', () => {
  it('通用指令：送出欄位、使用者的輸入與這支影片的資料，記下建議（未採用）', async () => {
    const before = world.fake.requests.length;

    const log = await suggest({ field: 'creative.input', videoId: 'v1', userInput: '媽祖救漁民' });

    expect(log).toMatchObject({
      seriesId: 's1',
      videoId: 'v1',
      field: 'creative.input',
      userInput: '媽祖救漁民',
      adopted: false,
    });
    expect(log.suggestion).toMatch(/^錄製的 AI 建議/);
    const sent = world.fake.requests[before];
    expect(sent?.system).toContain('廟埕影室的 AI 輔助撰寫');
    expect(sent?.user).toContain('媽祖救漁民');
    expect(sent?.user).toContain('板橋慈惠宮');
    expect(sent?.user).toContain('清代由漳州移民建廟');
    expect(world.db.select().from(aiAssistLogs).all()).toHaveLength(1);
  });

  it('「想講的故事」用 Prompt Studio 的 copy-polish 節點，取 polished', async () => {
    const before = world.fake.requests.length;

    const log = await suggest({ field: 'questionnaire.story', videoId: 'v1', userInput: '媽祖救起漁船' });

    expect(log.suggestion).toContain('漁民在廟埕點香');
    const sent = world.fake.requests[before];
    expect(sent?.system).toContain('故事編輯');
    expect(sent?.user).toContain('媽祖救起漁船');
    expect(sent?.user).toContain('板橋慈惠宮');
    expect(sent?.user).toContain('溫暖寫實、黃昏暖色調');
  });

  it('定裝版修改指令帶上視角名稱；問卷「或自己寫」帶上題目', async () => {
    const before = world.fake.requests.length;
    await suggest({ field: 'templeView.instruction', videoId: 'v1', target: { viewKey: 'front_overview' } });
    await suggest({ field: 'questionnaire.custom', videoId: 'v1', target: { questionId: 'tone' } });

    expect(world.fake.requests[before]?.user).toContain('廟前全景');
    expect(world.fake.requests[before + 1]?.user).toContain('語氣');
  });

  it('系列表單還沒有系列：只記下欄位與建議，series_id 是 null', async () => {
    const log = await suggest({ field: 'series.visualStyle', userInput: '溫暖' });
    expect(log).toMatchObject({ seriesId: null, videoId: null, field: 'series.visualStyle' });
  });

  it('系列表單指定了系列：記下系列', async () => {
    const log = await suggest({ field: 'series.visualStyle', seriesId: 's1' });
    expect(log.seriesId).toBe('s1');
  });

  it('連續要求兩次，各自記錄、建議不同（再寫一版）', async () => {
    const first = await suggest({ field: 'creative.input', videoId: 'v1' });
    const second = await suggest({ field: 'creative.input', videoId: 'v1' });
    expect(second.id).not.toBe(first.id);
    expect(second.suggestion).not.toBe(first.suggestion);
  });

  it('不會產生任何生成紀錄，也不會改動影片', async () => {
    const before = world.db.select().from(videos).where(eq(videos.id, 'v1')).get();
    await suggest({ field: 'creative.input', videoId: 'v1' });
    expect(world.db.select().from(generations).all()).toEqual([]);
    expect(world.db.select().from(videos).where(eq(videos.id, 'v1')).get()).toEqual(before);
  });

  it.each([
    [{ field: 'plan.shot' }, 400, '這個欄位不能使用 AI 幫我寫'],
    [{ field: 'creative.input' }, 400, '這個欄位要指定影片'],
    [{ field: 'creative.input', videoId: 'nope' }, 404, '找不到這支影片'],
    [{ field: 'series.visualStyle', seriesId: 'nope' }, 404, '找不到這個系列'],
  ] as const)('%o：%s %s', async (request, status, message) => {
    await expectStudioError(() => suggest(request), status, message);
    expect(world.db.select().from(aiAssistLogs).all()).toEqual([]);
  });

  it('Claude 回的格式不正確：502，不記錄', async () => {
    await expectStudioError(
      () => suggest({ field: 'creative.input', videoId: 'v1', userInput: '測試：AI 建議格式錯誤' }),
      502,
      'AI 建議的格式不正確，請再試一次',
    );
    expect(world.db.select().from(aiAssistLogs).all()).toEqual([]);
  });

  it('沒有設定 Claude：503', async () => {
    const unavailable = createAssistService({
      db: world.db,
      clock: world.clock,
      prompts: world.prompts,
      model: null,
      unavailableMessage: '還沒設定 Claude',
    });
    await expectStudioError(() => unavailable.suggest(assistRequestSchema.parse({ field: 'creative.input', videoId: 'v1' })), 503, '還沒設定 Claude');
  });
});

describe('採用', () => {
  it('按「採用」才記為已採用', async () => {
    const log = await suggest({ field: 'creative.input', videoId: 'v1' });
    expect(assist.find(log.id).adopted).toBe(false);

    const adopted = assist.adopt(log.id);

    expect(adopted).toEqual({ ...log, adopted: true });
    expect(assist.find(log.id).adopted).toBe(true);
  });

  it('找不到這筆建議：404', async () => {
    await expectStudioError(() => assist.adopt('nope'), 404, '找不到這筆 AI 建議');
    await expectStudioError(() => assist.find('nope'), 404, '找不到這筆 AI 建議');
  });
});

describe('角色的外觀描述與連續性鎖', () => {
  it('用 Prompt Studio 的 character-design 節點；外觀描述取 description，連續性鎖一行一條', async () => {
    const before = world.fake.requests.length;

    const description = await suggest({ field: 'character.description', videoId: 'v1', userInput: '七十多歲的阿嬤', target: { characterId: 'x' } });
    const locks = await suggest({ field: 'character.locks', videoId: 'v1', userInput: '七十多歲的阿嬤' });

    expect(world.fake.requests[before]?.system).toContain('角色設計師');
    expect(world.fake.requests[before]?.user).toContain('七十多歲的阿嬤');
    expect(description.suggestion).toContain('七十多歲的在地阿嬤');
    expect(locks.suggestion).toBe('grey cotton cardigan\nsilver hairpin');
  });
});


// 使用者 2026-11-05 提出：系列設定的角色庫也能用 AI 幫我寫（沒有影片，只有系列）
// 2026-11-05 使用者回報：節點的指令本身沒有寫輸出格式，真的 Claude 會回一般文字
describe('用 Prompt Studio 節點撰寫時要求只回 JSON', () => {
  it.each([
    ['character.description', 'character-design', ['description', 'continuityLocks']],
    ['questionnaire.story', 'copy-polish', ['polished']],
  ] as const)('%s（%s 節點）：系統指令最後要求只回一個 JSON 物件，並列出輸出欄位', async (field, _node, keys) => {
    const before = world.fake.requests.length;

    await suggest({ field, videoId: 'v1', userInput: '媽祖救漁民' });

    const system = world.fake.requests[before]?.system ?? '';
    expect(system).toContain('只回一個 JSON 物件');
    for (const key of keys) expect(system).toContain(`"${key}"`);
  });
});

describe('角色庫的 AI 幫我寫', () => {
  it('只指定系列也可以寫角色的外觀描述與連續性鎖；紀錄屬於系列，不屬於任何影片', async () => {
    const description = await suggest({ field: 'character.description', seriesId: 's1', userInput: '戴斗笠的阿公' });
    const locks = await suggest({ field: 'character.locks', seriesId: 's1', userInput: '戴斗笠的阿公' });

    expect(description).toMatchObject({ seriesId: 's1', videoId: null, field: 'character.description' });
    expect(description.suggestion.length).toBeGreaterThan(0);
    expect(locks).toMatchObject({ seriesId: 's1', videoId: null, field: 'character.locks' });
  });

  it('新增角色還沒有角色編號：直接帶角色名稱，寫給 Claude 的內容有這個名稱', async () => {
    const before = world.fake.requests.length;

    await suggest({ field: 'character.description', seriesId: 's1', userInput: '戴斗笠', target: { characterName: '阿公' } });

    expect(world.fake.requests[before]?.user).toContain('阿公');
  });

  it('角色編號找不到時，用帶進來的角色名稱', async () => {
    const before = world.fake.requests.length;

    await suggest({ field: 'character.description', videoId: 'v1', userInput: '戴斗笠', target: { characterId: 'nope', characterName: '阿公' } });

    expect(world.fake.requests[before]?.user).toContain('阿公');
  });
});
