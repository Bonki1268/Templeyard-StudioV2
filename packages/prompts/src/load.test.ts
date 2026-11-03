import { mkdtempSync, rmSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadPromptFiles, loadWorkflowConfig } from './load.js';
import { promptsDir, workflowsFile } from './paths.js';

describe('讀取 prompt JSON', () => {
  it('prompt-studio/prompts 的 11 個節點都通過 Zod 驗證，不含歷史版本', () => {
    const prompts = loadPromptFiles(promptsDir);
    expect([...prompts.keys()].sort()).toEqual([
      'character-design',
      'character-look',
      'character-sheet',
      'copy-polish',
      'keyframe',
      'refined-frame',
      'region-edit',
      'shot-video',
      'story-script',
      'storyboard-image',
      'temple-view',
    ]);
  });

  it('有一份不合法時丟出錯誤，指出是哪個檔案', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'prompts-'));
    try {
      copyFileSync(path.join(promptsDir, 'temple-view.json'), path.join(dir, 'temple-view.json'));
      writeFileSync(path.join(dir, 'broken.json'), JSON.stringify({ id: 'broken', step: 9 }));
      mkdirSync(path.join(dir, '.history'));
      expect(() => loadPromptFiles(dir)).toThrow(/broken\.json/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('讀取 workflows/models.json（07 實測，2026-11-03）', () => {
  it('上傳用 upload_file 取得一次性網址再 PUT', () => {
    expect(loadWorkflowConfig(workflowsFile).upload).toEqual({ mode: 'signed_put', tool: 'upload_file', clientOs: 'darwin' });
  });

  it('Gemini Omni 走圖生影片範本：首格放在第 11 號節點，指令在第 7 號節點；每秒 31 點已實測', () => {
    const model = loadWorkflowConfig(workflowsFile).models['gemini-omni-1.1-flash'];
    expect(model).toMatchObject({
      tool: 'run_template',
      args: { name: 'api_google_gemini_omni_flash_1_1_i2v' },
      frameInputs: { first: { paths: [['input_overrides', '11', 'image']] } },
      price: { unit: 'second', credits: 31, verified: true },
    });
    expect(model?.slots?.prompt?.paths).toEqual([['input_overrides', '7', 'model.prompt']]);
    expect(model?.frameInputs?.last).toBeUndefined();
  });

  it('Gemini 有末格或關鍵畫格時改用參考圖範本：首格是 @Image1，末格與關鍵畫格拼成一張放在 @Image2', () => {
    const variant = loadWorkflowConfig(workflowsFile).models['gemini-omni-1.1-flash']?.referenceVariant;
    expect(variant).toMatchObject({
      args: { name: 'api_google_gemini_omni_flash_1_1_r2v' },
      frameInputs: { first: { paths: [['input_overrides', '11', 'image']] } },
      references: { paths: [['input_overrides', '15', 'image']], max: 1, format: 'single', sheet: { max: 4 } },
    });
  });

  it('Seedance 2.0 走首尾畫格範本：首格第 3 號、末格第 4 號節點；每秒約 46 點已實測', () => {
    const model = loadWorkflowConfig(workflowsFile).models['seedance-2.0'];
    expect(model).toMatchObject({
      tool: 'run_template',
      args: { name: 'api_seedance2_0_flf2v' },
      // 首尾畫格範本一定要末格（沒有時會用範本自帶的示範圖）
      frameInputs: { first: { paths: [['input_overrides', '3', 'image']] }, last: { paths: [['input_overrides', '4', 'image']], required: true } },
      price: { unit: 'second', credits: 46, verified: true },
    });
  });

  it('Nano Banana Pro：一次只收一張參考圖，多的先拼成一張（最多 4 張）；每張約 33 點已實測', () => {
    const model = loadWorkflowConfig(workflowsFile).models['nano-banana-pro'];
    expect(model).toMatchObject({
      status: 'verified',
      references: { paths: [['medias']], max: 1, format: 'medias', role: 'reference_image', sheet: { max: 4 } },
      price: { unit: 'image', credits: 33, verified: true },
    });
    expect(model?.args).toMatchObject({ client_os: 'darwin' });
  });

  it('呼叫方式不知道的模型仍標為 unknown', () => {
    expect(loadWorkflowConfig(workflowsFile).models['wan-2.2']?.status).toBe('unknown');
  });
});
