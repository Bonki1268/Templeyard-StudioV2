import { QUESTIONNAIRE_QUESTIONS, type GenerateQuestionnaireInput } from '@templeyard/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chatMessages, series, videos } from '../db/schema.js';
import { addPhoto, addVideo, createStudioWorld, type StudioWorld } from './__fixtures__/studio.js';
import { StudioError } from './errors.js';
import { createQuestionnaireService, type QuestionnaireService } from './questionnaire.js';

let world: StudioWorld;
let service: QuestionnaireService;

const ALL = QUESTIONNAIRE_QUESTIONS.map((q) => q.id);
const open = (videoId = 'v1', prefill: GenerateQuestionnaireInput['prefill'] = [{ questionId: 'story', custom: '講媽祖顯靈救漁民的故事' }]) =>
  service.open(videoId, { questionIds: ALL, prefill });

function seriesDefaults() {
  return world.db.select().from(series).where(eq(series.id, 's1')).get()?.questionnaireDefaults ?? null;
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
  addVideo(world, { id: 'v1' });
  service = createQuestionnaireService({ db: world.db, clock: world.clock });
});

afterEach(async () => {
  await world.close();
});

describe('開啟問卷', () => {
  it('依預填順序建立問卷，影片進到問卷階段', () => {
    const questionnaire = open();

    expect(questionnaire.videoId).toBe('v1');
    expect(questionnaire.submittedAt).toBeNull();
    expect(questionnaire.answers.map((a) => a.questionId)).toEqual(ALL);
    expect(questionnaire.answers[0]).toEqual({ questionId: 'story', custom: '講媽祖顯靈救漁民的故事', source: 'user' });
    expect(questionnaire.answers.find((a) => a.questionId === 'length')).toMatchObject({ choice: '30 秒', source: 'series_default' });
    expect(world.db.select().from(videos).where(eq(videos.id, 'v1')).get()?.stage).toBe('questionnaire');
    expect(service.get('v1')).toEqual(questionnaire);
  });

  it('還沒開啟問卷時是 null；影片不存在時 404', async () => {
    expect(service.get('v1')).toBeNull();
    await expectStudioError(() => service.get('nope'), 404, '找不到這支影片');
  });

  it('送出前再開啟一次，換掉原本的問卷（一支影片一份）', () => {
    const first = open();
    const second = service.open('v1', { questionIds: ['story', 'tone'], prefill: [] });

    expect(second.id).toBe(first.id);
    expect(service.get('v1')?.answers.map((a) => a.questionId)).toEqual(['story', 'tone']);
  });

  it('已送出後不能重新產生', async () => {
    open();
    service.submit('v1', { answers: [] });
    await expectStudioError(() => open(), 409, '問卷已送出，不能重新產生');
  });

  it('系列已有問卷預設值時帶入，標示系列預設', () => {
    world.db.update(series).set({ questionnaireDefaults: { audience: { choice: '外地遊客' } } }).where(eq(series.id, 's1')).run();
    const questionnaire = open();
    expect(questionnaire.answers.find((a) => a.questionId === 'audience')).toEqual({
      questionId: 'audience',
      choice: '外地遊客',
      source: 'series_default',
    });
  });

  it('系列問卷預設值的格式不正確時當成沒有預設值，不會讓問卷打不開', () => {
    world.db.update(series).set({ questionnaireDefaults: { audience: '外地遊客' } }).where(eq(series.id, 's1')).run();
    expect(open().answers.find((a) => a.questionId === 'audience')).toEqual({ questionId: 'audience', source: 'system' });
  });
});

describe('送出問卷', () => {
  it('寫入送出時間；系列第一支送出問卷的影片，答案存成系列問卷預設值（排除每支影片不同的題目）', () => {
    const photoId = addPhoto(world);
    open();

    const result = service.submit('v1', {
      answers: [
        { questionId: 'story', custom: '講媽祖顯靈救漁民的故事' },
        { questionId: 'audience', choice: '外地遊客' },
        { questionId: 'tone', choice: '溫暖' },
        { questionId: 'length', choice: '30 秒' },
        { questionId: 'photos', photoIds: [photoId] },
        { questionId: 'mustSay', custom: '媽祖救起漁船' },
      ],
    });

    expect(result.seriesDefaultsSaved).toBe(true);
    expect(result.questionnaire.submittedAt).not.toBeNull();
    expect(result.questionnaire.answers.find((a) => a.questionId === 'photos')).toEqual({
      questionId: 'photos',
      photoIds: [photoId],
      source: 'user',
    });
    expect(seriesDefaults()).toEqual({ audience: { choice: '外地遊客' }, tone: { choice: '溫暖' }, length: { choice: '30 秒' } });
  });

  it('系列已有問卷預設值時不覆蓋', () => {
    world.db.update(series).set({ questionnaireDefaults: { tone: { choice: '莊重' } } }).where(eq(series.id, 's1')).run();
    open();

    const result = service.submit('v1', { answers: [{ questionId: 'tone', choice: '溫暖' }] });

    expect(result.seriesDefaultsSaved).toBe(false);
    expect(seriesDefaults()).toEqual({ tone: { choice: '莊重' } });
  });

  it('對話記下「送出問卷」與答案摘要', () => {
    open();
    service.submit('v1', { answers: [{ questionId: 'audience', choice: '外地遊客' }] });

    const messages = world.db.select().from(chatMessages).where(eq(chatMessages.videoId, 'v1')).all();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ role: 'user', scope: 'video', toolCalls: [] });
    expect(messages[0]?.content.split('\n')).toEqual([
      '送出問卷',
      '想講的故事：系統將會選擇',
      '這支影片想達成什麼？：系統將會選擇',
      '主要觀眾是誰？：外地遊客',
      '故事怎麼說？：系統將會選擇',
      '角色：系統將會選擇',
      '語氣：系統將會選擇',
      '長度：系統將會選擇',
      '一定要出現的照片：系統將會選擇',
      '一定要說到的事：系統將會選擇',
    ]);
  });

  it('可以再送出一次（分鏡方案建立前）；系列問卷預設值只在第一次寫入', () => {
    open();
    service.submit('v1', { answers: [{ questionId: 'tone', choice: '溫暖' }] });
    const again = service.submit('v1', { answers: [{ questionId: 'tone', choice: '莊重' }] });

    expect(again.seriesDefaultsSaved).toBe(false);
    expect(again.questionnaire.answers.find((a) => a.questionId === 'tone')).toMatchObject({ choice: '莊重' });
    // 沒有送的題目當成留白，所以第一次只寫入語氣
    expect(seriesDefaults()).toEqual({ tone: { choice: '溫暖' } });
  });

  it('還沒開啟問卷：409', async () => {
    await expectStudioError(() => service.submit('v1', { answers: [] }), 409, 'Agent 還沒開啟問卷');
  });

  it('答案不正確：400，說明原因', async () => {
    open();
    await expectStudioError(() => service.submit('v1', { answers: [{ questionId: 'tone', choice: '搞笑' }] }), 400, '請從選項中選擇');
  });

  it('照片要是這支影片（同系列同一間廟）的照片', async () => {
    const otherTemple = addPhoto(world, { templeId: 't2' });
    open();
    await expectStudioError(
      () => service.submit('v1', { answers: [{ questionId: 'photos', photoIds: [otherTemple] }] }),
      400,
      '找不到這張照片',
    );
  });
});
