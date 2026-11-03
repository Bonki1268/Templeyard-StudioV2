import { QUESTIONNAIRE_QUESTIONS, createPlanVersionSchema } from '@templeyard/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCharacterService, type CharacterService } from '../characters/service.js';
import { shots } from '../db/schema.js';
import { addConfirmedBoard, addVideo, createStudioWorld, type StudioWorld } from '../studio/__fixtures__/studio.js';
import { createQuestionnaireService } from '../studio/questionnaire.js';
import { createPlanService, type PlanService } from './service.js';

// 第 8 階段：方案的角色存成角色編號（05 shots.character_ids）；補充視角確認後卡片改用新的視角

let world: StudioWorld;
let characters: CharacterService;
let plans: PlanService;

beforeEach(async () => {
  world = await createStudioWorld();
  addVideo(world, { id: 'v1', creativeInput: '講媽祖的故事' });
  addConfirmedBoard(world, 'v1');
  const questionnaires = createQuestionnaireService({ db: world.db, clock: world.clock });
  questionnaires.open('v1', { questionIds: QUESTIONNAIRE_QUESTIONS.map((q) => q.id), prefill: [{ questionId: 'story', custom: '講媽祖的故事' }] });
  questionnaires.submit('v1', { answers: [{ questionId: 'story', custom: '講媽祖的故事' }] });
  characters = createCharacterService({ db: world.db, clock: world.clock, workflows: world.workflows, prompts: world.prompts, generation: null });
  plans = createPlanService({ db: world.db, clock: world.clock, workflows: world.workflows, prompts: world.prompts, model: world.model, characters });
});

afterEach(async () => {
  await world.close();
});

describe('方案的角色', () => {
  it('產生方案時建立 Agent 提出的新角色（外觀描述與連續性鎖照 Agent 給的）', async () => {
    await plans.generate('v1');
    expect(characters.listForVideo('v1')).toEqual([
      expect.objectContaining({ name: '阿嬤', state: 'draft', version: expect.objectContaining({ description: '七十多歲的在地阿嬤', continuityLocks: ['grey cotton cardigan'] }) }),
    ]);
  });

  it('資料庫存角色編號，API 仍然回角色名稱', async () => {
    const plan = await plans.generate('v1');
    const id = characters.listForVideo('v1')[0]?.id;
    expect(plan.shots[1]?.characters).toEqual(['阿嬤']);
    const stored = world.db.select().from(shots).all().find((row) => row.shotKey === plan.shots[1]?.shotKey);
    expect(stored?.characterIds).toEqual([id]);
  });

  it('讀取方案時附上方案用到的角色', async () => {
    await plans.generate('v1');
    expect(plans.get('v1').characters?.map((c) => [c.name, c.state])).toEqual([['阿嬤', 'draft']]);
  });

  it('手動修改時寫了新的角色名稱：建立影片專屬角色（外觀描述留白）', async () => {
    const plan = await plans.generate('v1');
    const inputs = plan.shots.map(({ seq: _s, startSec: _t, dialogueEstimateSec: _d, ...rest }) => rest);
    inputs[0] = { ...inputs[0]!, characters: ['阿公'] };
    plans.createVersion('v1', createPlanVersionSchema.parse({ baseVersion: 1, shots: inputs }));
    expect(characters.listForVideo('v1').map((c) => [c.name, c.version.description])).toEqual([
      ['阿嬤', '七十多歲的在地阿嬤'],
      ['阿公', ''],
    ]);
  });
});

describe('補充視角確認後', () => {
  it('用到這個缺少視角的格子改用新的視角，存成新版本', async () => {
    await plans.generate('v1');

    const plan = plans.replaceViewKey('v1', 'missing:後殿', 'custom:後殿');

    expect(plan).toMatchObject({ version: 2, source: 'user_edit' });
    expect(plan?.shots[3]?.viewKey).toBe('custom:後殿');
    expect(plan?.diff.summary).toBe('改了第 4 格');
  });

  it('沒有格子用到這個視角：不新增版本', async () => {
    await plans.generate('v1');
    expect(plans.replaceViewKey('v1', 'missing:老樹', 'custom:老樹')).toBeNull();
    expect(plans.current('v1')?.version).toBe(1);
  });

  it('還沒有方案：不新增版本', () => {
    expect(plans.replaceViewKey('v1', 'missing:後殿', 'custom:後殿')).toBeNull();
  });
});
