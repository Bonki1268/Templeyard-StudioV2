import { createToolRegistry } from '@templeyard/agent';
import { QUESTIONNAIRE_QUESTIONS, type ChatEvent } from '@templeyard/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPlanService, type PlanService } from '../plans/service.js';
import { addConfirmedBoard, addVideo, createStudioWorld, type StudioWorld } from './__fixtures__/studio.js';
import { AGENT_TOOL_NAMES, REVISE_PLAN_TOOL, createAgentTools } from './agentTools.js';
import { createChatService } from './chat.js';
import { createQuestionnaireService, type QuestionnaireService } from './questionnaire.js';

// 方案建立後的對話：Agent 多了 revise_plan，依序號修改並列出改了哪幾格

let world: StudioWorld;
let questionnaires: QuestionnaireService;
let plans: PlanService;

async function withPlan() {
  questionnaires.open('v1', { questionIds: QUESTIONNAIRE_QUESTIONS.map((q) => q.id), prefill: [{ questionId: 'story', custom: '講媽祖的故事' }] });
  questionnaires.submit('v1', { answers: [{ questionId: 'story', custom: '講媽祖的故事' }] });
  return plans.generate('v1');
}

function tools() {
  return createAgentTools({ db: world.db, videoId: 'v1', questionnaires, workflows: world.workflows, plans });
}

beforeEach(async () => {
  world = await createStudioWorld();
  addVideo(world, { id: 'v1', creativeInput: '講媽祖的故事' });
  addConfirmedBoard(world, 'v1');
  questionnaires = createQuestionnaireService({ db: world.db, clock: world.clock });
  plans = createPlanService({ db: world.db, clock: world.clock, workflows: world.workflows, prompts: world.prompts, model: world.model });
});

afterEach(async () => {
  await world.close();
});

describe('revise_plan 工具', () => {
  it('還沒有方案時沒有 revise_plan', () => {
    expect(tools().map((t) => t.name)).toEqual([...AGENT_TOOL_NAMES]);
  });

  it('方案建立後多了 revise_plan，仍然沒有付費工具', async () => {
    await withPlan();
    const list = tools();
    expect(list.map((t) => t.name)).toEqual([...AGENT_TOOL_NAMES, REVISE_PLAN_TOOL]);
    expect(list.every((t) => !t.paid)).toBe(true);
  });

  it('依序號修改，摘要列出改了哪幾格', async () => {
    await withPlan();
    const result = await createToolRegistry(tools(), { verifyConsent: () => false }).run(
      REVISE_PLAN_TOOL,
      { changes: [{ seq: 1, shotSize: '特寫' }] },
      { consentToken: null },
    );
    expect(result.call).toEqual({ name: 'revise_plan', label: '修改方案', ok: true, summary: '改了第 1 格' });
    expect(result.content).toContain('第 2 版');
    expect(plans.current('v1')?.shots[0]?.shotSize).toBe('特寫');
  });

  it('沒有這一格：失敗，不新增版本', async () => {
    await withPlan();
    const result = await createToolRegistry(tools(), { verifyConsent: () => false }).run(
      REVISE_PLAN_TOOL,
      { changes: [{ seq: 9, shotSize: '特寫' }] },
      { consentToken: null },
    );
    expect(result).toMatchObject({ status: 'failed', content: '方案沒有第 9 格' });
    expect(plans.current('v1')?.version).toBe(1);
  });
});

describe('方案建立後的對話', () => {
  it('系統指令列出目前的方案；「第 1 格改成特寫」：Agent 修改方案並列出改了哪幾格', async () => {
    await withPlan();
    const chat = createChatService({
      db: world.db,
      clock: world.clock,
      workflows: world.workflows,
      consents: world.consents,
      questionnaires,
      plans,
      model: world.model,
    });
    const before = world.fake.requests.length;
    const events: ChatEvent[] = [];

    await chat.send('v1', '第 1 格改成特寫', (event) => events.push(event));

    expect(world.fake.requests[before]?.system).toContain('目前的分鏡方案（第 1 版）');
    expect(world.fake.requests[before]?.tools).toContain(REVISE_PLAN_TOOL);
    expect(events.find((e) => e.type === 'tool')).toEqual({ type: 'tool', call: { name: 'revise_plan', label: '修改方案', ok: true, summary: '改了第 1 格' } });
    expect(events.at(-1)?.type).toBe('done');
    expect(plans.current('v1')).toMatchObject({ version: 2, source: 'chat_edit' });
  });
});
