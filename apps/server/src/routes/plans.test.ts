import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { apiErrorSchema, planResponseSchema, planVersionResponseSchema, QUESTIONNAIRE_QUESTIONS, type Plan } from '@templeyard/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { addConfirmedBoard, addVideo, createStudioWorld, type StudioWorld } from '../studio/__fixtures__/studio.js';
import { createQuestionnaireService } from '../studio/questionnaire.js';

let world: StudioWorld;
let app: FastifyInstance;
let assetsDir: string;

function submitQuestionnaire() {
  const questionnaires = createQuestionnaireService({ db: world.db, clock: world.clock });
  questionnaires.open('v1', { questionIds: QUESTIONNAIRE_QUESTIONS.map((q) => q.id), prefill: [{ questionId: 'story', custom: '講媽祖的故事' }] });
  questionnaires.submit('v1', { answers: [{ questionId: 'story', custom: '講媽祖的故事' }] });
}

async function generate(): Promise<Plan> {
  const response = await app.inject({ method: 'POST', url: '/api/videos/v1/plan/generate' });
  expect(response.statusCode).toBe(201);
  return planVersionResponseSchema.parse(response.json()).plan;
}

const postVersion = (payload: unknown) => app.inject({ method: 'POST', url: '/api/videos/v1/plan/versions', payload: payload as Record<string, unknown> });

beforeEach(async () => {
  world = await createStudioWorld();
  assetsDir = mkdtempSync(path.join(tmpdir(), 'templeyard-plan-'));
  addVideo(world, { id: 'v1', creativeInput: '講媽祖的故事' });
  addConfirmedBoard(world, 'v1');
  app = buildApp({ db: world.db, clock: world.clock, assetsDir, workflows: world.workflows, prompts: world.prompts, text: { agent: world.model, assist: world.model } });
});

afterEach(async () => {
  await app.close();
  await world.close();
  rmSync(assetsDir, { recursive: true, force: true });
});

describe('POST /api/videos/:id/plan/generate', () => {
  it('201：回應第 1 版；GET 看得到方案、版本、規則與視角', async () => {
    submitQuestionnaire();
    const plan = await generate();
    expect(plan.version).toBe(1);

    const got = planResponseSchema.parse((await app.inject({ method: 'GET', url: '/api/videos/v1/plan' })).json());
    expect(got.plan?.shots).toHaveLength(4);
    expect(got.versions).toHaveLength(1);
    expect(got.rules.minGenerationSec).toBe(3);
    expect(got.views).toEqual([{ viewKey: 'front_overview', viewName: '廟前全景', source: 'photo', confirmed: true, state: 'ready' }]);
  });

  it('問卷還沒送出：409', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/videos/v1/plan/generate' });
    expect(response.statusCode).toBe(409);
    expect(apiErrorSchema.parse(response.json()).message).toBe('請先送出問卷');
  });

  it('影片不存在：404', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/videos/nope/plan' });
    expect(response.statusCode).toBe(404);
  });
});

describe('POST /api/videos/:id/plan/versions', () => {
  it('201：新增一個版本；GET versions/:version 看得到舊版', async () => {
    submitQuestionnaire();
    const v1 = await generate();
    const shots = v1.shots.map(({ seq: _s, startSec: _t, dialogueEstimateSec: _d, ...rest }) => rest);

    const response = await postVersion({ baseVersion: 1, shots: [shots[1], shots[0], shots[2], shots[3]] });

    expect(response.statusCode).toBe(201);
    expect(planVersionResponseSchema.parse(response.json()).plan.version).toBe(2);
    const old = planVersionResponseSchema.parse((await app.inject({ method: 'GET', url: '/api/videos/v1/plan/versions/1' })).json());
    expect(old.plan.shots.map((s) => s.shotKey)).toEqual(v1.shots.map((s) => s.shotKey));
  });

  it.each([
    ['有一格不到 1 秒', { baseVersion: 1, shots: [{ durationSec: 0, shotSize: '中景' }] }, 400, '每格至少 1 秒'],
    ['沒有任何一格', { baseVersion: 1, shots: [] }, 400, '方案至少要有一格'],
    ['景別不在選項', { baseVersion: 1, shots: [{ durationSec: 3, shotSize: '大特寫' }] }, 400, '請從遠景、中景、特寫選擇'],
    ['沒有指定根據哪一版', { shots: [{ durationSec: 3, shotSize: '中景' }] }, 400, '請指定根據哪一版修改'],
    ['回到不存在的版本', { baseVersion: 1, revertTo: 9 }, 404, '找不到這個方案版本'],
  ])('%s：%s', async (_label, payload, status, message) => {
    submitQuestionnaire();
    await generate();
    const response = await postVersion(payload);
    expect(response.statusCode).toBe(status);
    expect(apiErrorSchema.parse(response.json()).message).toBe(message);
  });

  it('不是根據最新的版本修改：409', async () => {
    submitQuestionnaire();
    await generate();
    await postVersion({ baseVersion: 1, revertTo: 1 });
    const response = await postVersion({ baseVersion: 1, revertTo: 1 });
    expect(response.statusCode).toBe(409);
    expect(apiErrorSchema.parse(response.json()).message).toBe('方案已經有新的版本，請重新整理後再改');
  });
});
