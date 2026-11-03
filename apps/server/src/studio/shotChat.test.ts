import { QUESTIONNAIRE_QUESTIONS, type ChatEvent } from '@templeyard/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCharacterService } from '../characters/service.js';
import { createPlanService, type PlanService } from '../plans/service.js';
import { addConfirmedBoard, addVideo, createStudioWorld, type StudioWorld } from './__fixtures__/studio.js';
import { createChatService, type ChatService } from './chat.js';
import { StudioError } from './errors.js';
import { createQuestionnaireService } from './questionnaire.js';

// 第 10 階段：細修頁的對話只針對這一格

let world: StudioWorld;
let plans: PlanService;
let chat: ChatService;

beforeEach(async () => {
  world = await createStudioWorld();
  addVideo(world, { id: 'v1', creativeInput: '講媽祖的故事' });
  addConfirmedBoard(world, 'v1');
  const questionnaires = createQuestionnaireService({ db: world.db, clock: world.clock });
  questionnaires.open('v1', { questionIds: QUESTIONNAIRE_QUESTIONS.map((q) => q.id), prefill: [{ questionId: 'story', custom: '講媽祖的故事' }] });
  questionnaires.submit('v1', { answers: [{ questionId: 'story', custom: '講媽祖的故事' }] });
  const characters = createCharacterService({ db: world.db, clock: world.clock, workflows: world.workflows, prompts: world.prompts, generation: null });
  plans = createPlanService({ db: world.db, clock: world.clock, workflows: world.workflows, prompts: world.prompts, model: world.model, characters });
  await plans.generate('v1');
  chat = createChatService({ db: world.db, clock: world.clock, workflows: world.workflows, consents: world.consents, questionnaires, plans, model: world.model });
});

afterEach(async () => {
  await world.close();
});

function shotKey(seq: number): string {
  const key = plans.current('v1')?.shots[seq - 1]?.shotKey;
  if (!key) throw new Error(`沒有第 ${seq} 格`);
  return key;
}

async function send(content: string, key?: string) {
  const events: ChatEvent[] = [];
  await chat.send('v1', content, (event) => events.push(event), key);
  return events;
}

describe('只針對這一格的對話', () => {
  it('系統指令說明只針對這一格；工具只有修改這一格', async () => {
    const before = world.fake.requests.length;
    await send('這一格改成特寫', shotKey(2));
    const sent = world.fake.requests[before];
    expect(sent?.system).toContain('這次只針對分鏡第 2 格');
    expect(sent?.tools).toEqual(['revise_shot']);
  });

  it('Agent 修改這一格，存成對話修改的新版本，其他格不變', async () => {
    const before = plans.current('v1');
    const events = await send('這一格改成特寫', shotKey(2));

    expect(events.find((e) => e.type === 'tool')).toEqual({ type: 'tool', call: { name: 'revise_shot', label: '修改這一格', ok: true, summary: '改了第 2 格' } });
    const after = plans.current('v1');
    expect(after).toMatchObject({ version: 2, source: 'chat_edit' });
    expect(after?.shots[1]?.shotSize).toBe('特寫');
    expect(after?.shots[0]).toEqual(before?.shots[0]);
  });

  it('這一格的對話與整支影片的對話分開', async () => {
    await send('這一格改成特寫', shotKey(2));
    // 整支影片的對話只有問卷的答案摘要，沒有這一格的對話
    expect(chat.list('v1').map((m) => m.content)).not.toContain('這一格改成特寫');
    expect(chat.list('v1').every((m) => m.role === 'user')).toBe(true);
    expect(chat.list('v1', shotKey(2)).map((m) => m.role)).toEqual(['user', 'agent']);
    expect(chat.list('v1', shotKey(3))).toEqual([]);
  });

  it('方案沒有這一格：404', async () => {
    let caught: unknown = null;
    try {
      await send('你好', 'nope');
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(StudioError);
    expect(caught).toMatchObject({ status: 404, message: '方案沒有這一格' });
  });
});
