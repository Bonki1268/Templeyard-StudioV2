import { createToolRegistry } from '@templeyard/agent';
import { QUESTIONNAIRE_QUESTIONS } from '@templeyard/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { series } from '../db/schema.js';
import { addVideo, createStudioWorld, type StudioWorld } from './__fixtures__/studio.js';
import { AGENT_TOOL_NAMES, createAgentTools } from './agentTools.js';
import { createQuestionnaireService, type QuestionnaireService } from './questionnaire.js';

let world: StudioWorld;
let questionnaires: QuestionnaireService;

function registry() {
  const tools = createAgentTools({ db: world.db, videoId: 'v1', questionnaires, workflows: world.workflows });
  return { tools, registry: createToolRegistry(tools, { verifyConsent: () => false }) };
}

const run = (name: string, input: unknown) => registry().registry.run(name, input, { consentToken: null });

beforeEach(async () => {
  world = await createStudioWorld();
  addVideo(world, { id: 'v1' });
  questionnaires = createQuestionnaireService({ db: world.db, clock: world.clock });
});

afterEach(async () => {
  await world.close();
});

describe('Agent 的工具', () => {
  it('第 6 階段只有不花錢的四個工具', () => {
    const { tools } = registry();
    expect(tools.map((t) => t.name)).toEqual([...AGENT_TOOL_NAMES]);
    expect(tools.every((t) => !t.paid)).toBe(true);
  });

  it('查詢寺廟：只讀，結果帶來源標記', async () => {
    const result = await run('search_temples', { q: '慈惠宮' });
    expect(result.status).toBe('ok');
    expect(result.content).toContain('板橋慈惠宮');
    expect(result.content).toContain('板橋區');
    expect(result.content).toContain('來源：寺廟資料庫');
    expect(result.content).not.toContain('新莊地藏庵');
  });

  it('查詢寺廟沒有結果時說明', async () => {
    const result = await run('search_temples', { q: '不存在的廟' });
    expect(result).toMatchObject({ status: 'ok', content: '寺廟資料庫裡沒有符合的寺廟' });
  });

  it('讀取系列設定：風格、秒數、方向與系列問卷預設值', async () => {
    world.db.update(series).set({ questionnaireDefaults: { tone: { choice: '溫暖' } } }).where(eq(series.id, 's1')).run();
    const result = await run('read_series', {});
    expect(result.status).toBe('ok');
    const parsed = JSON.parse(result.content) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      name: '新北廟宇故事',
      visualStyle: '溫暖寫實、黃昏暖色調',
      direction: '歷史故事',
      questionnaireDefaults: { tone: { choice: '溫暖' } },
    });    // 使用者 2026-11-05 提出：系列不再設定影片秒數
    expect(parsed).not.toHaveProperty('durationSec');
  });

  it('開啟問卷：建立這支影片的問卷，摘要寫題數', async () => {
    const result = await run('generate_questionnaire', {
      questionIds: QUESTIONNAIRE_QUESTIONS.map((q) => q.id),
      prefill: [{ questionId: 'story', custom: '講媽祖顯靈救漁民的故事' }],
    });
    expect(result.status).toBe('ok');
    expect(result.call).toEqual({ name: 'generate_questionnaire', label: '開啟問卷', ok: true, summary: '開啟問卷，共 9 題' });
    expect(questionnaires.get('v1')?.answers).toHaveLength(9);
  });

  it('開啟問卷的題目不在題庫：格式不正確，不建立問卷', async () => {
    const result = await run('generate_questionnaire', { questionIds: ['not_a_question'] });
    expect(result.status).toBe('invalid_input');
    expect(questionnaires.get('v1')).toBeNull();
  });

  it('預估費用：依參考單價；單價待實測時說明', async () => {
    // Nano Banana 2 Lite 的單價還沒實測（Nano Banana Pro 在 2026-11-03 實測過了）
    const result = await run('estimate_cost', { items: [{ model: 'nano-banana-2-lite', units: 2 }] });
    expect(result.status).toBe('ok');
    expect(result.content).toContain('單價待實測');
  });

  it('預估費用的模型不存在：失敗並說明', async () => {
    const result = await run('estimate_cost', { items: [{ model: 'no-such-model', units: 1 }] });
    expect(result).toMatchObject({ status: 'failed', content: '沒有這個模型的呼叫設定' });
  });
});
