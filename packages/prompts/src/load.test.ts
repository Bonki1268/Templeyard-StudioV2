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

describe('讀取 workflows/models.json', () => {
  it('通過驗證，Gemini Omni 走 run_template 的第 26 號節點', () => {
    const config = loadWorkflowConfig(workflowsFile);
    expect(config.models['gemini-omni-1.1-flash']).toMatchObject({
      tool: 'run_template',
      args: { name: 'api_google_gemini_omni_flash_1_1_t2v' },
      price: { unit: 'second', credits: 31 },
    });
  });

  it('還沒實測的單價是 null，呼叫方式不知道的模型標為 unknown', () => {
    const config = loadWorkflowConfig(workflowsFile);
    expect(config.models['seedance-2.0']?.price.credits).toBeNull();
    expect(config.models['wan-2.2']?.status).toBe('unknown');
  });
});
