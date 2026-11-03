import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  apiErrorSchema,
  chatEventSchema,
  chatListResponseSchema,
  createSseParser,
  questionnaireResponseSchema,
  submitQuestionnaireResponseSchema,
  videoResponseSchema,
} from '@templeyard/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { addVideo, createStudioWorld, type StudioWorld } from '../studio/__fixtures__/studio.js';

let world: StudioWorld;
let app: FastifyInstance;
let assetsDir: string;

function build(text: boolean) {
  return buildApp({
    db: world.db,
    clock: world.clock,
    assetsDir,
    workflows: world.workflows,
    prompts: world.prompts,
    text: text ? { agent: world.model, assist: world.model } : null,
    textUnavailableMessage: '還沒設定 Claude，不能使用創作對話與 AI 幫我寫：請在 .env.local 設定 ANTHROPIC_API_KEY',
  });
}

function postChat(content: unknown, videoId = 'v1') {
  return app.inject({ method: 'POST', url: `/api/videos/${videoId}/chat`, payload: { content } });
}

function events(body: string) {
  return createSseParser()
    .push(body)
    .map((m) => chatEventSchema.parse(JSON.parse(m.data)));
}

beforeEach(async () => {
  world = await createStudioWorld();
  assetsDir = mkdtempSync(path.join(tmpdir(), 'templeyard-studio-'));
  addVideo(world, { id: 'v1' });
  app = build(true);
});

afterEach(async () => {
  await app.close();
  await world.close();
  rmSync(assetsDir, { recursive: true, force: true });
});

describe('POST /api/videos/:id/chat', () => {
  it('以 SSE 串流回應：使用者訊息、Agent 的文字與工具、完成', async () => {
    const response = await postChat('講媽祖顯靈救漁民的故事');

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    const received = events(response.body);
    expect(received.map((e) => e.type)).toEqual(['user', 'text', 'tool', 'text', 'done']);
    // SSE 的事件名稱與 data 的 type 相同
    expect(createSseParser().push(response.body).map((m) => m.event)).toEqual(['user', 'text', 'tool', 'text', 'done']);
  });

  it('串流結束後，對話紀錄、問卷與影片的階段都更新了', async () => {
    await postChat('講媽祖顯靈救漁民的故事');

    const list = chatListResponseSchema.parse((await app.inject({ method: 'GET', url: '/api/videos/v1/chat' })).json());
    expect(list.messages.map((m) => m.role)).toEqual(['user', 'agent']);
    const questionnaire = questionnaireResponseSchema.parse((await app.inject({ method: 'GET', url: '/api/videos/v1/questionnaire' })).json());
    expect(questionnaire.questionnaire?.answers[0]).toMatchObject({ questionId: 'story', custom: '講媽祖顯靈救漁民的故事' });
    const video = videoResponseSchema.parse((await app.inject({ method: 'GET', url: '/api/videos/v1' })).json());
    expect(video.video).toMatchObject({ stage: 'questionnaire', creativeInput: '講媽祖顯靈救漁民的故事' });
  });

  it.each([
    ['內容是空白', '   ', 'v1', 400, '請輸入想對 Agent 說的話'],
    ['內容超過 2000 字', '字'.repeat(2001), 'v1', 400, '內容最多 2000 字'],
    ['影片不存在', '你好', 'nope', 404, '找不到這支影片'],
  ])('%s：回應 %s 的 JSON 錯誤，不串流', async (_label, content, videoId, status, message) => {
    const response = await postChat(content, videoId);
    expect(response.statusCode).toBe(status);
    expect(apiErrorSchema.parse(response.json()).message).toBe(message);
  });

  it('寺廟定裝版還沒確認：409', async () => {
    addVideo(world, { id: 'v2', stage: 'board_pending' });
    const response = await postChat('你好', 'v2');
    expect(response.statusCode).toBe(409);
    expect(apiErrorSchema.parse(response.json()).message).toBe('寺廟定裝版還沒確認，還不能開始創作');
  });

  it('沒有設定 Claude：503，說明要設定哪些環境變數', async () => {
    await app.close();
    app = build(false);
    const response = await postChat('你好');
    expect(response.statusCode).toBe(503);
    expect(apiErrorSchema.parse(response.json()).message).toContain('ANTHROPIC_API_KEY');
  });

  it('Agent 失敗時以 error 事件說明（HTTP 仍是 200，因為串流已經開始）', async () => {
    const response = await postChat('測試：問卷格式錯誤');
    expect(response.statusCode).toBe(200);
    expect(events(response.body).at(-1)).toEqual({ type: 'error', message: 'Agent 回的問卷格式不正確，請再試一次' });
  });
});

describe('GET /api/videos/:id/chat', () => {
  it('影片不存在：404', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/videos/nope/chat' });
    expect(response.statusCode).toBe(404);
  });

  it('還沒對話時是空的', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/videos/v1/chat' });
    expect(chatListResponseSchema.parse(response.json())).toEqual({ messages: [] });
  });
});

describe('問卷', () => {
  const putAnswers = (answers: unknown) => app.inject({ method: 'PUT', url: '/api/videos/v1/questionnaire', payload: { answers } });

  it('還沒開啟問卷時 GET 回 null；PUT 回 409', async () => {
    const got = questionnaireResponseSchema.parse((await app.inject({ method: 'GET', url: '/api/videos/v1/questionnaire' })).json());
    expect(got.questionnaire).toBeNull();
    const put = await putAnswers([]);
    expect(put.statusCode).toBe(409);
    expect(apiErrorSchema.parse(put.json()).message).toBe('Agent 還沒開啟問卷');
  });

  it('送出問卷：寫入系列問卷預設值，系列 API 看得到', async () => {
    await postChat('講媽祖顯靈救漁民的故事');

    const response = await putAnswers([
      { questionId: 'story', custom: '講媽祖顯靈救漁民的故事' },
      { questionId: 'audience', choice: '外地遊客' },
    ]);

    expect(response.statusCode).toBe(200);
    const body = submitQuestionnaireResponseSchema.parse(response.json());
    expect(body.seriesDefaultsSaved).toBe(true);
    const list = (await app.inject({ method: 'GET', url: '/api/series' })).json() as { series: { id: string; questionnaireDefaults: unknown }[] };
    expect(list.series.find((s) => s.id === 's1')?.questionnaireDefaults).toEqual({ audience: { choice: '外地遊客' } });
  });

  it.each([
    ['選項不在這一題', [{ questionId: 'tone', choice: '搞笑' }], '請從選項中選擇'],
    ['同時選了選項又自己寫', [{ questionId: 'tone', choice: '溫暖', custom: '更溫暖' }], '選項和自己寫只能擇一'],
    ['照片不是這支影片的', [{ questionId: 'photos', photoIds: ['other'] }], '找不到這張照片'],
    ['資料不是陣列', 'tone', '問卷的資料不正確'],
    ['自己寫超過 500 字', [{ questionId: 'tone', custom: '字'.repeat(501) }], '自己寫最多 500 字'],
  ])('%s：400，說明原因', async (_label, answers, message) => {
    await postChat('講媽祖顯靈救漁民的故事');
    const response = await putAnswers(answers);
    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).message).toBe(message);
  });

  it('題目不在這份問卷：400', async () => {
    await postChat('講媽祖顯靈救漁民的故事');
    // 先換成只有兩題的問卷，再送出不在問卷裡的題目
    const { createQuestionnaireService } = await import('../studio/questionnaire.js');
    createQuestionnaireService({ db: world.db, clock: world.clock }).open('v1', { questionIds: ['story', 'tone'], prefill: [] });

    const response = await putAnswers([{ questionId: 'goal', choice: '介紹歷史' }]);
    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).message).toBe('這份問卷沒有這一題');
  });

  it('影片不存在：404', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/videos/nope/questionnaire' });
    expect(response.statusCode).toBe(404);
  });
});
