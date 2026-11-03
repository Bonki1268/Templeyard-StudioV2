import type { ChatEvent } from '@templeyard/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chatMessages, generations, videos } from '../db/schema.js';
import { addVideo, createStudioWorld, type StudioWorld } from './__fixtures__/studio.js';
import { AGENT_TOOL_NAMES } from './agentTools.js';
import { createChatService, type ChatService } from './chat.js';
import { StudioError } from './errors.js';
import { createQuestionnaireService, type QuestionnaireService } from './questionnaire.js';

// 以錄製的回應（tests/fakes/claude/recordings.json 的「廟埕影室的創作 Agent」）測試 Agent 工具流程

let world: StudioWorld;
let questionnaires: QuestionnaireService;
let chat: ChatService;

function service(model = world.model) {
  return createChatService({
    db: world.db,
    clock: world.clock,
    workflows: world.workflows,
    consents: world.consents,
    questionnaires,
    model,
  });
}

async function send(content: string, videoId = 'v1') {
  const events: ChatEvent[] = [];
  await chat.send(videoId, content, (event) => events.push(event));
  return events;
}

function video(id = 'v1') {
  return world.db.select().from(videos).where(eq(videos.id, id)).get();
}

function expectStudioError(run: () => unknown, status: number, message: string) {
  let caught: unknown = null;
  try {
    run();
  } catch (error: unknown) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(StudioError);
  expect(caught).toMatchObject({ status, message });
}

beforeEach(async () => {
  world = await createStudioWorld();
  addVideo(world, { id: 'v1', userTempleNotes: '清代由漳州移民建廟' });
  questionnaires = createQuestionnaireService({ db: world.db, clock: world.clock });
  chat = service();
});

afterEach(async () => {
  await world.close();
});

describe('對話前的檢查', () => {
  it('定裝版已確認（chat 階段之後）可以對話', () => {
    expect(() => chat.prepare('v1')).not.toThrow();
  });

  it.each(['creating', 'board_pending'] as const)('影片在 %s 階段：409，定裝版還沒確認', (stage) => {
    addVideo(world, { id: 'v2', stage });
    expectStudioError(() => chat.prepare('v2'), 409, '寺廟定裝版還沒確認，還不能開始創作');
  });

  it('影片不存在：404', () => {
    expectStudioError(() => chat.prepare('nope'), 404, '找不到這支影片');
  });

  it('沒有設定 Claude：503，說明缺少什麼', () => {
    const unavailable = createChatService({
      db: world.db,
      clock: world.clock,
      workflows: world.workflows,
      consents: world.consents,
      questionnaires,
      model: null,
      unavailableMessage: '還沒設定 Claude',
    });
    expectStudioError(() => unavailable.prepare('v1'), 503, '還沒設定 Claude');
  });
});

describe('送出一句話', () => {
  it('依序送出：使用者訊息 → Agent 的說明 → 開啟問卷 → Agent 的結語 → 完成', async () => {
    const events = await send('講媽祖顯靈救漁民的故事');

    expect(events.map((e) => e.type)).toEqual(['user', 'text', 'tool', 'text', 'done']);
    expect(events[0]).toMatchObject({ type: 'user', message: { role: 'user', content: '講媽祖顯靈救漁民的故事' } });
    expect(events[2]).toEqual({
      type: 'tool',
      call: { name: 'generate_questionnaire', label: '開啟問卷', ok: true, summary: expect.stringContaining('9 題') },
    });
    const done = events.at(-1);
    expect(done).toMatchObject({ type: 'done', message: { role: 'agent', toolCalls: [{ name: 'generate_questionnaire', ok: true }] } });
  });

  it('Agent 開啟問卷：「想講的故事」預填這句話，影片進到問卷階段', async () => {
    await send('講媽祖顯靈救漁民的故事');

    const questionnaire = questionnaires.get('v1');
    expect(questionnaire?.answers[0]).toEqual({ questionId: 'story', custom: '講媽祖顯靈救漁民的故事', source: 'user' });
    expect(video()?.stage).toBe('questionnaire');
  });

  it('第一句話存成創作輸入；之後的話不會覆蓋', async () => {
    await send('講媽祖顯靈救漁民的故事');
    await send('觀眾以年輕人為主');

    expect(video()?.creativeInput).toBe('講媽祖顯靈救漁民的故事');
  });

  it('使用者與 Agent 的訊息都存下來，依時間排序', async () => {
    await send('講媽祖顯靈救漁民的故事');

    const listed = chat.list('v1');
    expect(listed.map((m) => m.role)).toEqual(['user', 'agent']);
    expect(listed[1]?.content.length).toBeGreaterThan(0);
    expect(listed[1]?.toolCalls.map((c) => c.label)).toEqual(['開啟問卷']);
  });

  it('Agent 收到系統指令（含寺廟與使用者提供的歷史）、工具清單只有不花錢的工具', async () => {
    const before = world.fake.requests.length;
    await send('講媽祖顯靈救漁民的故事');

    const first = world.fake.requests[before];
    expect(first?.model).toBe('fake-agent-model');
    expect(first?.system).toContain('廟埕影室的創作 Agent');
    expect(first?.system).toContain('板橋慈惠宮');
    expect(first?.system).toContain('清代由漳州移民建廟');
    expect(first?.tools).toEqual([...AGENT_TOOL_NAMES]);
  });

  it('之前的對話一併送給 Claude', async () => {
    await send('講媽祖顯靈救漁民的故事');
    const before = world.fake.requests.length;

    await send('觀眾以年輕人為主');

    const next = world.fake.requests[before];
    expect(next?.user).toContain('講媽祖顯靈救漁民的故事');
    expect(next?.user).toContain('觀眾以年輕人為主');
  });

  it('對話不會產生任何生成紀錄（不會觸發付費生成）', async () => {
    await send('講媽祖顯靈救漁民的故事');
    expect(world.db.select().from(generations).all()).toEqual([]);
  });

  it('Agent 回的問卷格式修正一次仍然錯誤：送出 error，不存 Agent 訊息、不開啟問卷', async () => {
    const before = world.fake.requests.length;
    const events = await send('測試：問卷格式錯誤');

    expect(events.map((e) => e.type)).toEqual(['user', 'text', 'tool', 'text', 'tool', 'error']);
    expect(events.at(-1)).toEqual({ type: 'error', message: 'Agent 回的問卷格式不正確，請再試一次' });
    expect(world.fake.requests.length - before).toBe(2);
    expect(chat.list('v1').map((m) => m.role)).toEqual(['user']);
    expect(questionnaires.get('v1')).toBeNull();
    expect(video()?.stage).toBe('chat');
  });

  it('連不上 Claude：送出 error 說明原因', async () => {
    const { createClaudeModel } = await import('@templeyard/agent');
    chat = service(createClaudeModel({ apiKey: 'fake-claude-key', model: 'm', baseURL: 'http://127.0.0.1:9' }));

    const events = await send('講媽祖顯靈救漁民的故事');

    expect(events.at(-1)).toEqual({ type: 'error', message: '連不上 Claude API，請確認網路' });
  }, 30_000);

  it('問卷送出後再對話：Agent 想重新產生問卷時被拒絕，對話仍然完成', async () => {
    await send('講媽祖顯靈救漁民的故事');
    questionnaires.submit('v1', { answers: [] });

    const events = await send('再幫我想想');

    expect(events.find((e) => e.type === 'tool')).toEqual({
      type: 'tool',
      call: expect.objectContaining({ name: 'generate_questionnaire', ok: false, summary: '問卷已送出，不能重新產生' }),
    });
    expect(events.at(-1)?.type).toBe('done');
    expect(questionnaires.get('v1')?.submittedAt).not.toBeNull();
  });
});

describe('對話紀錄', () => {
  it('只列出這支影片的訊息', async () => {
    addVideo(world, { id: 'v2' });
    await send('講媽祖顯靈救漁民的故事');

    expect(chat.list('v2')).toEqual([]);
    expect(world.db.select().from(chatMessages).where(eq(chatMessages.videoId, 'v1')).all()).toHaveLength(2);
  });

  it('影片不存在：404', () => {
    expectStudioError(() => chat.list('nope'), 404, '找不到這支影片');
  });
});
