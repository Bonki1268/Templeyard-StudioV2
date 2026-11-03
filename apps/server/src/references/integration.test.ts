import type { WorkflowConfig } from '@templeyard/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { loadWorkflowConfig } from '@templeyard/prompts';
import { findAsset } from '../assets/repository.js';
import { createClipsWorld, type ClipsWorld } from '../clips/__fixtures__/clipsWorld.js';
import { createFramesWorld, type FramesWorld } from '../frames/__fixtures__/framesWorld.js';
import { e2eWorkflowsFile } from '../templeBoards/__fixtures__/world.js';

// 07 實測（2026-11-03）：參考圖多於模型一次收的張數時拼成一張；Gemini 有末格或關鍵畫格時改用參考圖範本

let frames: FramesWorld | null = null;
let clips: ClipsWorld | null = null;

afterEach(async () => {
  await frames?.close();
  await clips?.close();
  frames = null;
  clips = null;
});

/** 情境測試的設定，改成照實測：Nano Banana Pro 一次收 1 張、最多拼 4 張；Gemini 只有首格，有末格或關鍵畫格時改用參考圖範本 */
function measuredWorkflows(): WorkflowConfig {
  const config = structuredClone(loadWorkflowConfig(e2eWorkflowsFile));
  const nano = config.models['nano-banana-pro'];
  const gemini = config.models['gemini-omni-1.1-flash'];
  if (!nano || !gemini?.frameInputs) throw new Error('情境測試的設定缺少模型');
  nano.references = { paths: [['fake_reference_images']], max: 1, sheet: { max: 4 } };
  gemini.frameInputs = { first: gemini.frameInputs.first };
  gemini.referenceVariant = {
    args: { name: 'api_google_gemini_omni_flash_1_1_r2v' },
    slots: gemini.slots ?? {},
    frameInputs: { first: { paths: [['fake_first_frame']] } },
    references: { paths: [['fake_sheet']], max: 1, format: 'single', sheet: { max: 4 } },
  };
  return config;
}

function uploadedFile(world: FramesWorld, ref: unknown): string | undefined {
  return world.world.fake.uploads.find((u) => u.ref === ref)?.filename;
}

describe('精緻圖的參考圖拼成一張', () => {
  it('第 2 格有角色定裝圖與視角圖兩張：拼成一張送出，指令說明每一格是什麼', async () => {
    frames = await createFramesWorld({ workflows: measuredWorkflows() });
    await frames.frames.generate('v1', frames.consent(4));
    await frames.settleAll();

    const calls = frames.world.fake.calls.filter((c) => c.tool === 'partner_generate' && c.args?.confirm === true && JSON.stringify(c.args).includes('分鏡 2，首格'));
    expect(calls).toHaveLength(1);
    const refs = calls[0]?.args?.fake_reference_images as unknown[];
    expect(refs).toHaveLength(1);
    // 送出的是新拼出來的一張（不是角色定裝圖或視角圖本身），可以上雲
    const sheetId = uploadedFile(frames, refs[0])?.split('.')[0] ?? '';
    const look = frames.characters.listForVideo('v1')[0]?.version.lookAssetId;
    expect(sheetId).not.toBe(look);
    expect(findAsset(frames.world.db, sheetId)).toMatchObject({ cloudOk: true, width: 1280, height: 720 });
    const written = frames.world.writer.calls.find((c) => c.content.includes('分鏡 2，首格'));
    expect(written?.content).toContain('參考圖拼成一張（由左到右、由上到下）：第 1 格是角色「阿嬤」定裝圖');
  });

  it('只有一張參考圖的格子：照原樣送，不拼', async () => {
    frames = await createFramesWorld({ workflows: measuredWorkflows() });
    await frames.frames.generate('v1', frames.consent(4));
    await frames.settleAll();
    const view = frames.world.fake.calls.find((c) => c.tool === 'partner_generate' && c.args?.confirm === true && JSON.stringify(c.args).includes('分鏡 3，首格'));
    const refs = view?.args?.fake_reference_images as unknown[];
    expect(refs).toHaveLength(1);
    expect(uploadedFile(frames, refs[0])).toMatch(/^[^.]+\.png$/);
    const written = frames.world.writer.calls.find((c) => c.content.includes('分鏡 3，首格'));
    expect(written?.content).not.toContain('參考圖拼成一張');
  });
});

describe('Gemini 的影片：有末格或關鍵畫格時改用參考圖範本', () => {
  it('第 4 格有關鍵畫格與末格：改用 r2v，首格放 @Image1，末格與關鍵畫格拼成一張放 @Image2', async () => {
    clips = await createClipsWorld({ confirm: false, workflows: measuredWorkflows() });
    clips.plans.updateShot('v1', 'k4', { keyframesEnabled: true, keyframeTimes: [5] });
    await clips.frames.generateKeyframes('v1', 'k4', clips.consent(2));
    await clips.settleAll();
    clips.confirmAll();
    expect((await clips.clips.generate('v1', clips.clipConsent())).status).toBe('accepted');
    await clips.settleAll();
    await clips.clips.whenComposed('v1');

    const detail = clips.frames.detail('v1', 'k4');
    const videoCalls = clips.world.fake.calls.filter((c) => c.tool === 'run_template' && c.args?.confirm === true && /t2v|i2v|r2v/.test(String(c.args?.name)));
    const k4 = videoCalls.find((c) => uploadedFile(clips as ClipsWorld, c.args?.fake_first_frame) === `${detail.first?.assetId}.png`);
    expect(k4?.args?.name).toBe('api_google_gemini_omni_flash_1_1_r2v');
    expect(typeof k4?.args?.fake_sheet).toBe('string');
    const sheetId = uploadedFile(clips, k4?.args?.fake_sheet)?.split('.')[0] ?? '';
    expect(sheetId).not.toBe(detail.last?.assetId);
    expect(findAsset(clips.world.db, sheetId)?.cloudOk).toBe(true);
    expect(k4?.args).not.toHaveProperty('fake_last_frame');
    const written = clips.world.writer.calls.find((c) => c.system.includes('圖生影片') && c.content.includes('分鏡 4，'));
    expect(written?.content).toContain('參考圖拼成一張');
    expect(written?.content).toContain('末格');
  });

  it('沒有末格與關鍵畫格的格子：照原本的圖生影片範本，只有首格', async () => {
    clips = await createClipsWorld({ workflows: measuredWorkflows() });
    expect((await clips.clips.generate('v1', clips.clipConsent())).status).toBe('accepted');
    await clips.settleAll();
    await clips.clips.whenComposed('v1');
    const config = measuredWorkflows();
    const videoCalls = clips.world.fake.calls.filter((c) => c.tool === 'run_template' && c.args?.confirm === true && /t2v|i2v|r2v/.test(String(c.args?.name)));
    expect(videoCalls).toHaveLength(4);
    expect(videoCalls.every((c) => c.args?.name === config.models['gemini-omni-1.1-flash']?.args?.name)).toBe(true);
    expect(videoCalls.every((c) => !('fake_sheet' in (c.args ?? {})))).toBe(true);
  });
});
