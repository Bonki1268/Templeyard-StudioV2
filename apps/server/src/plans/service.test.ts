import { createPlanVersionSchema, QUESTIONNAIRE_QUESTIONS, type CreatePlanVersionInput, type Plan } from '@templeyard/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generations, videos } from '../db/schema.js';
import { addConfirmedBoard, addVideo, createStudioWorld, type StudioWorld } from '../studio/__fixtures__/studio.js';
import { StudioError } from '../studio/errors.js';
import { createQuestionnaireService, type QuestionnaireService } from '../studio/questionnaire.js';
import { createPlanService, type PlanService } from './service.js';

// 以錄製的回應（recordings.json 的「導演兼分鏡師」）測試產生方案

let world: StudioWorld;
let questionnaires: QuestionnaireService;
let plans: PlanService;

function service(model = world.model) {
  return createPlanService({ db: world.db, clock: world.clock, workflows: world.workflows, prompts: world.prompts, model });
}

/** 問卷開啟並送出：想講的故事、主要觀眾 */
function submitQuestionnaire(videoId = 'v1', story = '講媽祖顯靈救漁民的故事', extra: { questionId: string; choice: string }[] = []) {
  questionnaires.open(videoId, { questionIds: QUESTIONNAIRE_QUESTIONS.map((q) => q.id), prefill: [{ questionId: 'story', custom: story }] });
  questionnaires.submit(videoId, { answers: [{ questionId: 'story', custom: story }, { questionId: 'audience', choice: '外地遊客' }, ...extra] });
}

const edit = (videoId: string, input: CreatePlanVersionInput) => plans.createVersion(videoId, createPlanVersionSchema.parse(input));

/** 把方案的卡片原樣帶回去（保留 shotKey），可以覆寫幾格 */
function inputsOf(plan: Plan) {
  return plan.shots.map(({ seq: _seq, startSec: _start, dialogueEstimateSec: _estimate, ...rest }) => rest);
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
  world = await createStudioWorld();
  addVideo(world, { id: 'v1', creativeInput: '講媽祖顯靈救漁民的故事', userTempleNotes: '清代由漳州移民建廟' });
  addConfirmedBoard(world, 'v1');
  questionnaires = createQuestionnaireService({ db: world.db, clock: world.clock });
  plans = service();
});

afterEach(async () => {
  await world.close();
});

describe('產生分鏡方案', () => {
  it('Agent 產生第 1 版：每格有不同的 shotKey，依序號排好時間，影片進到方案階段', async () => {
    submitQuestionnaire();

    const plan = await plans.generate('v1');

    expect(plan).toMatchObject({ version: 1, source: 'agent', styleNote: '溫暖寫實的清晨光線，節奏舒緩' });
    expect(plan.shots.map((s) => [s.seq, s.startSec, s.durationSec, s.shotSize, s.viewKey])).toEqual([
      [1, 0, 6, '遠景', 'front_overview'],
      [2, 6, 8, '中景', 'front_overview'],
      [3, 14, 2, '特寫', 'front_overview'],
      [4, 16, 10, '中景', 'missing:後殿'],
    ]);
    expect(new Set(plan.shots.map((s) => s.shotKey)).size).toBe(4);
    expect(plan.shots[1]).toMatchObject({ characters: ['阿嬤'], dialogue: '媽祖婆保佑大家平安。', speaker: '阿嬤', dialogueEstimateSec: 3.3 });
    expect(world.db.select().from(videos).where(eq(videos.id, 'v1')).get()?.stage).toBe('plan');
  });

  it('送給 Claude 的是 story-script 節點，帶入寺廟、問卷、定裝版視角、影片模型的最短生成長度與語速；一定要用 submit_plan', async () => {
    submitQuestionnaire();
    const before = world.fake.requests.length;

    await plans.generate('v1');

    const sent = world.fake.requests[before];
    expect(sent?.system).toContain('導演兼分鏡師');
    expect(sent?.toolChoice).toEqual({ type: 'tool', name: 'submit_plan' });
    expect(sent?.tools).toEqual(['submit_plan']);
    for (const text of ['板橋慈惠宮', '清代由漳州移民建廟', '外地遊客', '講媽祖顯靈救漁民的故事', 'front_overview：廟前全景', '最短生成長度 3 秒', '每秒約 4 字', '30 秒']) {
      expect(sent?.user).toContain(text);
    }
  });

  it('不會產生任何生成紀錄（產生方案不花圖片與影片的錢）', async () => {
    submitQuestionnaire();
    await plans.generate('v1');
    expect(world.db.select().from(generations).all()).toEqual([]);
  });

  it('問卷還沒送出：409', async () => {
    await expectStudioError(() => plans.generate('v1'), 409, '請先送出問卷');
  });

  it('已經有方案：409', async () => {
    submitQuestionnaire();
    await plans.generate('v1');
    await expectStudioError(() => plans.generate('v1'), 409, '已經有分鏡方案');
  });

  it('格式修正一次仍然錯誤：502，不建立方案，影片階段不變', async () => {
    submitQuestionnaire('v1', '測試：方案格式錯誤');
    const before = world.fake.requests.length;

    await expectStudioError(() => plans.generate('v1'), 502, 'Agent 回的分鏡方案格式不正確，請再試一次');

    expect(world.fake.requests.length - before).toBe(2);
    expect(plans.current('v1')).toBeNull();
    expect(world.db.select().from(videos).where(eq(videos.id, 'v1')).get()?.stage).toBe('questionnaire');
  });

  it('沒有設定 Claude：503', async () => {
    submitQuestionnaire();
    const unavailable = createPlanService({ db: world.db, clock: world.clock, workflows: world.workflows, prompts: world.prompts, model: null, unavailableMessage: '還沒設定 Claude' });
    await expectStudioError(() => unavailable.generate('v1'), 503, '還沒設定 Claude');
  });

  it('影片不存在：404', async () => {
    await expectStudioError(() => plans.generate('nope'), 404, '找不到這支影片');
  });
});

describe('讀取方案', () => {
  it('現行方案、版本清單、檢查規則、定裝版的視角', async () => {
    submitQuestionnaire();
    await plans.generate('v1');

    const response = plans.get('v1');

    expect(response.plan?.version).toBe(1);
    expect(response.versions.map((v) => [v.version, v.source])).toEqual([[1, 'agent']]);
    expect(response.rules).toEqual({ targetSec: 30, minGenerationSec: 3, videoModelLabel: 'Gemini Omni 1.1 Flash' });
    expect(response.views).toEqual([{ viewKey: 'front_overview', viewName: '廟前全景', source: 'photo', confirmed: true, state: 'ready' }]);
  });

  it('目標長度依問卷的「長度」', async () => {
    submitQuestionnaire('v1', '講媽祖的故事', [{ questionId: 'length', choice: '20 秒' }]);
    expect(plans.get('v1').rules.targetSec).toBe(20);
  });

  // 使用者 2026-11-05 提出：系列不再設定秒數；問卷沒有選長度時由系統決定，用上限 30 秒
  it('問卷沒有選長度：目標 30 秒', async () => {
    submitQuestionnaire('v1', '講媽祖的故事', [{ questionId: 'length' }]);
    expect(plans.get('v1').rules.targetSec).toBe(30);
  });

  it('還沒有方案時 plan 是 null', () => {
    expect(plans.get('v1').plan).toBeNull();
  });

  it('找不到版本：404', async () => {
    await expectStudioError(() => plans.version('v1', 9), 404, '找不到這個方案版本');
  });
});

describe('修改方案（新增版本）', () => {
  let v1: Plan;

  beforeEach(async () => {
    submitQuestionnaire();
    v1 = await plans.generate('v1');
  });

  it('手動修改：新增第 2 版，保留每一格的 shotKey，記下改了哪幾格', () => {
    const inputs = inputsOf(v1);
    inputs[0] = { ...inputs[0]!, description: '廟門在畫面左側' };

    const v2 = edit('v1', { baseVersion: 1, shots: inputs });

    expect(v2).toMatchObject({ version: 2, source: 'user_edit', diff: { summary: '改了第 1 格', changedShotKeys: [v1.shots[0]!.shotKey] } });
    expect(v2.shots.map((s) => s.shotKey)).toEqual(v1.shots.map((s) => s.shotKey));
    expect(plans.version('v1', 1).shots[0]?.description).toBe('板橋慈惠宮廟前全景，廟門在畫面中央');
  });

  it('調整順序：shotKey 跟著格子走，序號與開始秒數重算', () => {
    const inputs = inputsOf(v1);

    const v2 = edit('v1', { baseVersion: 1, shots: [inputs[1]!, inputs[0]!, inputs[2]!, inputs[3]!] });

    expect(v2.shots.map((s) => s.shotKey)).toEqual([v1.shots[1]!.shotKey, v1.shots[0]!.shotKey, v1.shots[2]!.shotKey, v1.shots[3]!.shotKey]);
    expect(v2.shots.map((s) => [s.seq, s.startSec])).toEqual([
      [1, 0],
      [2, 8],
      [3, 14],
      [4, 16],
    ]);
    expect(v2.diff.summary).toBe('調整了順序');
  });

  it('新增的格子給新的 shotKey', () => {
    const v2 = edit('v1', { baseVersion: 1, shots: [...inputsOf(v1), { durationSec: 3, shotSize: '中景' }] });
    const newKey = v2.shots[4]?.shotKey;
    expect(newKey).toBeTruthy();
    expect(v1.shots.map((s) => s.shotKey)).not.toContain(newKey);
  });

  it('不認得的 shotKey 當成新的一格', () => {
    const v2 = edit('v1', { baseVersion: 1, shots: [{ shotKey: 'forged', durationSec: 3, shotSize: '中景' }] });
    expect(v2.shots[0]?.shotKey).not.toBe('forged');
  });

  it('不是根據最新的版本修改：409', async () => {
    edit('v1', { baseVersion: 1, shots: inputsOf(v1) });
    await expectStudioError(() => edit('v1', { baseVersion: 1, shots: inputsOf(v1) }), 409, '方案已經有新的版本，請重新整理後再改');
  });

  it('回到舊版：另存為新版本，內容與舊版相同，記下回到第幾版', () => {
    const inputs = inputsOf(v1);
    inputs[0] = { ...inputs[0]!, description: '改過的畫面' };
    edit('v1', { baseVersion: 1, shots: inputs });

    const v3 = edit('v1', { baseVersion: 2, revertTo: 1 });

    expect(v3).toMatchObject({ version: 3, source: 'revert', diff: { revertedFrom: 1 } });
    expect(inputsOf(v3)).toEqual(inputsOf(v1));
    expect(plans.get('v1').versions.map((v) => v.version)).toEqual([1, 2, 3]);
  });

  it('回到不存在的版本：404', async () => {
    await expectStudioError(() => edit('v1', { baseVersion: 1, revertTo: 9 }), 404, '找不到這個方案版本');
  });

  it('還沒有方案：409', async () => {
    addVideo(world, { id: 'v2' });
    await expectStudioError(() => edit('v2', { baseVersion: 1, shots: [{ durationSec: 3, shotSize: '中景' }] }), 409, '還沒有分鏡方案');
  });
});

describe('對話修改（Agent 的 revise_plan）', () => {
  it('依序號修改，新增 chat_edit 版本，回傳改了哪幾格', async () => {
    submitQuestionnaire();
    const v1 = await plans.generate('v1');

    const { plan, diff } = plans.revise('v1', [{ seq: 1, shotSize: '特寫' }]);

    expect(plan).toMatchObject({ version: 2, source: 'chat_edit' });
    expect(plan.shots[0]).toMatchObject({ shotKey: v1.shots[0]!.shotKey, shotSize: '特寫' });
    expect(diff.summary).toBe('改了第 1 格');
  });

  it('沒有這一格：400，不新增版本', async () => {
    submitQuestionnaire();
    await plans.generate('v1');
    await expectStudioError(() => plans.revise('v1', [{ seq: 9, shotSize: '特寫' }]), 400, '方案沒有第 9 格');
    expect(plans.current('v1')?.version).toBe(1);
  });
});
