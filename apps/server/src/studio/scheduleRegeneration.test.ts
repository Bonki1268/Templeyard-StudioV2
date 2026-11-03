import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createClipsWorld, type ClipsWorld } from '../clips/__fixtures__/clipsWorld.js';
import { scheduleRegenerationTool } from './agentTools.js';

// 第 12 階段：創作 Agent 依使用者對成品的意見安排重生（不花錢；使用者看到費用、確認後才重生）

let t: ClipsWorld;

beforeEach(async () => {
  t = await createClipsWorld();
  expect((await t.clips.generate('v1', t.clipConsent())).status).toBe('accepted');
  await t.settleAll();
  await t.clips.whenComposed('v1');
});

afterEach(async () => {
  await t.close();
});

describe('安排重生（schedule_regeneration）', () => {
  it('不是付費工具；安排後那幾格的影片標示需重新確認，摘要列出格子與預估秒數', async () => {
    const tool = scheduleRegenerationTool(t.clips, t.plans, t.world.workflows, 'v1');
    expect(tool.paid).toBe(false);
    expect(tool.label).toBe('安排重生');
    const result = await tool.run({ shots: [2], instruction: '動作放慢一點' }, { consentToken: null });
    expect(result).toMatchObject({ ok: true, summary: '要重生第 2 格（Gemini Omni 1.1 Flash × 8 秒），按「重生並重新合成」確認費用' });
    expect(t.clips.clipOf('v1', 'k2')).toMatchObject({ needsReconfirm: true, revision: '動作放慢一點' });
  });

  it('格子不存在：不安排，說明原因', async () => {
    const tool = scheduleRegenerationTool(t.clips, t.plans, t.world.workflows, 'v1');
    const result = await tool.run({ shots: [9], instruction: '慢一點' }, { consentToken: null });
    expect(result).toMatchObject({ ok: false, summary: '方案沒有第 9 格' });
    expect(t.clips.get('v1').shots.every((s) => !s.clip?.needsReconfirm)).toBe(true);
  });
});
