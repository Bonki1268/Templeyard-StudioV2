import { createRequire } from 'node:module';
import path from 'node:path';
import type { PromptFile, WorkflowConfig } from '@templeyard/shared';
import { describe, expect, it } from 'vitest';
import { CallBuildError, buildMcpCall, validateBindings, workflowsForPrompt } from './bindings.js';
import { loadPromptFiles, loadWorkflowConfig } from './load.js';
import { promptsDir, repoRoot, workflowsFile } from './paths.js';

let loaded: WorkflowConfig | undefined;

/** 用到時才讀設定檔：讀取失敗時，每個測試各自失敗 */
function config(): WorkflowConfig {
  loaded ??= loadWorkflowConfig(workflowsFile);
  return loaded;
}

function prompt(id: string): PromptFile {
  const found = loadPromptFiles(promptsDir).get(id);
  if (!found) throw new Error(`找不到 ${id}`);
  return found;
}

describe('節點會用到的工作流程', () => {
  it('模型空白的圖片節點：所有呼叫方式已知的圖片模型', () => {
    expect(workflowsForPrompt(prompt('temple-view'), config()).map(([key]) => key).sort()).toEqual([
      'nano-banana-2-lite',
      'nano-banana-pro',
    ]);
  });

  it('影片節點不含呼叫方式還不知道的 Wan 2.2', () => {
    expect(workflowsForPrompt(prompt('shot-video'), config()).map(([key]) => key).sort()).toEqual([
      'gemini-omni-1.1-flash',
      'seedance-2.0',
    ]);
  });

  it('指定了模型的節點只看那一個', () => {
    expect(workflowsForPrompt(prompt('storyboard-image'), config()).map(([key]) => key)).toEqual(['nano-banana-2-lite']);
  });
});

describe('呼叫綁定的儲存檢查', () => {
  it('所有圖片與影片節點的呼叫綁定都通過', () => {
    for (const p of loadPromptFiles(promptsDir).values()) {
      if (p.target.kind === 'text') continue;
      expect(validateBindings(p, config()), p.id).toEqual([]);
    }
  });

  it('文字節點沒有呼叫綁定時通過；有的話拒絕', () => {
    const text = prompt('copy-polish');
    expect(validateBindings(text, config())).toEqual([]);
    expect(validateBindings({ ...text, bindings: { prompt: 'story' } }, config())).toEqual([
      '文字節點直接送 Claude，不能有呼叫綁定',
    ]);
  });

  it('圖片與影片節點一定要綁定 prompt', () => {
    expect(validateBindings({ ...prompt('temple-view'), bindings: { aspectRatio: 'target.aspectRatio' } }, config())).toContain(
      '圖片與影片節點要有呼叫綁定 prompt',
    );
  });

  it('綁定到工作流程沒有的位置名稱時拒絕', () => {
    const p = prompt('temple-view');
    expect(validateBindings({ ...p, bindings: { ...p.bindings, frameCount: 'view.key' } as PromptFile['bindings'] }, config())).toContain(
      '呼叫綁定 frameCount 不是工作流程的位置',
    );
  });

  it('綁定的資料沒有宣告時拒絕', () => {
    const p = prompt('temple-view');
    expect(validateBindings({ ...p, bindings: { ...p.bindings, prompt: 'shot.unknown' } }, config())).toContain(
      '呼叫綁定 prompt 用到 shot.unknown，但變數清單沒有宣告',
    );
  });

  it('有任一個會用到的工作流程沒有這個位置時拒絕，並指出是哪個模型', () => {
    const p = prompt('temple-view');
    expect(validateBindings({ ...p, bindings: { ...p.bindings, durationSec: 'view.key' } }, config())).toContain(
      '呼叫綁定 durationSec：Nano Banana Pro 的工作流程沒有這個位置',
    );
  });
});

describe('組出 MCP 呼叫', () => {
  const values = {
    output: { prompt: 'The temple at dusk.' },
    target: { aspectRatio: '16:9' },
    shot: { durationSec: 4 },
  };

  it('Gemini Omni：圖生影片範本的第 7 號節點（07 實測，2026-11-03）；秒數、比例與首格寫進指令開頭，解析度固定 720p', () => {
    const call = buildMcpCall({
      modelKey: 'gemini-omni-1.1-flash',
      config: config(),
      bindings: { prompt: 'output.prompt', aspectRatio: 'target.aspectRatio', durationSec: 'shot.durationSec' },
      values,
      seed: 42,
    });
    expect(call).toEqual({
      tool: 'run_template',
      args: {
        name: 'api_google_gemini_omni_flash_1_1_i2v',
        input_overrides: {
          7: {
            'model.prompt': 'A 4-second, 16:9 clip. Use @Image1 as the first frame. The temple at dusk.',
            'model.aspect_ratio': '16:9',
            'model.resolution': '720p',
            'model.task_type': 'image_to_video',
            'model.seed': 42,
          },
        },
      },
    });
  });

  it('Seedance：首尾畫格範本的第 1 號節點（07 實測，2026-11-03），比例、秒數與種子寫進節點', () => {
    const call = buildMcpCall({
      modelKey: 'seedance-2.0',
      config: config(),
      bindings: { prompt: 'output.prompt', aspectRatio: 'target.aspectRatio', durationSec: 'shot.durationSec' },
      values: { ...values, shot: { durationSec: 5 } },
      seed: 1,
    });
    expect(call).toEqual({
      tool: 'run_template',
      args: {
        name: 'api_seedance2_0_flf2v',
        input_overrides: {
          1: { 'model.prompt': 'The temple at dusk.', 'model.resolution': '720p', 'model.generate_audio': true, 'model.ratio': '16:9', 'model.duration': 5, seed: 1 },
        },
      },
    });
  });

  it('Nano Banana Pro：partner_generate 的 prompt 與 aspect_ratio', () => {
    expect(
      buildMcpCall({
        modelKey: 'nano-banana-pro',
        config: config(),
        bindings: { prompt: 'output.prompt', aspectRatio: 'target.aspectRatio' },
        values,
        seed: 1,
      }),
    ).toEqual({
      tool: 'partner_generate',
      args: { type: 'image', model: 'vertexai/nano-banana-pro', client_os: 'darwin', prompt: 'The temple at dusk.', aspect_ratio: '16:9' },
    });
  });

  it('不改動設定檔裡的 args', () => {
    buildMcpCall({ modelKey: 'seedance-2.0', config: config(), bindings: { prompt: 'output.prompt' }, values, seed: 1 });
    expect(config().models['seedance-2.0']?.args).toEqual({
      name: 'api_seedance2_0_flf2v',
      input_overrides: { 1: { 'model.resolution': '720p', 'model.generate_audio': true } },
    });
  });

  it.each([
    ['wan-2.2', { shot: { durationSec: 4 } }, 'Wan 2.2 的呼叫方式還沒確認，不能生成'],
    ['gemini-omni-1.1-flash', { target: { aspectRatio: '4:3' } }, 'Gemini Omni 1.1 Flash 不支援畫面比例 4:3'],
    ['gemini-omni-1.1-flash', { shot: { durationSec: 12 } }, 'Gemini Omni 1.1 Flash 的秒數要在 3～10 秒之間'],
    ['seedance-2.0', { shot: { durationSec: 3 } }, 'Seedance 2.0 的秒數要在 4～15 秒之間'],
    ['no-such-model', {}, '沒有這個模型的呼叫設定：no-such-model'],
  ])('%s 的呼叫組不出來時說明原因：%s', (modelKey, override, message) => {
    expect(() =>
      buildMcpCall({
        modelKey,
        config: config(),
        bindings: { prompt: 'output.prompt', aspectRatio: 'target.aspectRatio', durationSec: 'shot.durationSec' },
        values: { ...values, ...override },
        seed: 1,
      }),
    ).toThrow(new CallBuildError(message));
  });

  it('綁定的資料沒有值時說明缺了什麼', () => {
    expect(() =>
      buildMcpCall({ modelKey: 'nano-banana-pro', config: config(), bindings: { prompt: 'output.prompt' }, values: {}, seed: 1 }),
    ).toThrow(new CallBuildError('呼叫綁定 prompt 沒有值（output.prompt）'));
  });
});

describe('和 Prompt Studio 的儲存檢查一致', () => {
  type StudioBindings = { validateBindings: (p: unknown, config: unknown) => string[] };
  const studio = createRequire(import.meta.url)(path.join(repoRoot, 'prompt-studio', 'lib', 'bindings.js')) as StudioBindings;

  it('每個節點，以及改壞的綁定，兩邊回傳相同的錯誤', () => {
    for (const p of loadPromptFiles(promptsDir).values()) {
      const variants: PromptFile[] = [
        p,
        { ...p, bindings: { prompt: 'output.prompt' } },
        { ...p, bindings: { ...p.bindings, durationSec: 'shot.durationSec' } },
        { ...p, bindings: { ...p.bindings, seed: 'not.declared' } },
        { ...p, bindings: { ...p.bindings, frameCount: 'x' } as PromptFile['bindings'] },
        { ...p, bindings: undefined },
      ];
      for (const variant of variants) {
        expect(studio.validateBindings(variant, config()), `${p.id} ${JSON.stringify(variant.bindings)}`).toEqual(
          validateBindings(variant, config()),
        );
      }
    }
  });
});
