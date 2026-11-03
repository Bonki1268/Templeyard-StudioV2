import type { McpCall, WorkflowModel } from '@templeyard/shared';
import { describe, expect, it } from 'vitest';
import { CallBuildError } from './bindings.js';
import { loadWorkflowConfig } from './load.js';
import { workflowsFile } from './paths.js';
import { attachReferenceImages } from './references.js';

const call: McpCall = { tool: 'partner_generate', args: { type: 'image', model: 'vertexai/nano-banana-pro', prompt: 'p' } };

const withReferences: WorkflowModel = {
  label: '測試模型',
  kind: 'image',
  status: 'verified',
  tool: 'partner_generate',
  args: {},
  slots: { prompt: { paths: [['prompt']] } },
  references: { paths: [['inputs', 'images'], ['image_refs']], max: 2 },
  price: { unit: 'image', credits: null, verified: false },
};

describe('把參考圖寫進 MCP 呼叫', () => {
  it('依設定把參照清單寫到每個位置，不改動原本的呼叫', () => {
    const result = attachReferenceImages(call, withReferences, ['ref-1', 'ref-2']);

    expect(result.args).toEqual({ ...call.args, inputs: { images: ['ref-1', 'ref-2'] }, image_refs: ['ref-1', 'ref-2'] });
    expect(call.args).not.toHaveProperty('inputs');
  });

  it('沒有參考圖時原樣回傳', () => {
    expect(attachReferenceImages(call, withReferences, [])).toEqual(call);
  });

  it('超過最多張數時拒絕', () => {
    expect(() => attachReferenceImages(call, withReferences, ['a', 'b', 'c'])).toThrow(
      new CallBuildError('測試模型最多只能用 2 張參考圖'),
    );
  });

  it('medias 格式：每張寫成 { role, name, subfolder, type: "input" }（07 實測：partner_generate 收上傳後的 name）', () => {
    const model: WorkflowModel = { ...withReferences, references: { paths: [['medias']], max: 1, format: 'medias', role: 'reference_image' } };
    expect(attachReferenceImages(call, model, ['abc.png']).args.medias).toEqual([{ role: 'reference_image', name: 'abc.png', subfolder: '', type: 'input' }]);
  });

  it('medias 格式的參照帶有 subfolder 時拆開寫', () => {
    const model: WorkflowModel = { ...withReferences, references: { paths: [['medias']], max: 1, format: 'medias', role: 'reference_image' } };
    expect(attachReferenceImages(call, model, ['sub/abc.png']).args.medias).toEqual([{ role: 'reference_image', name: 'abc.png', subfolder: 'sub', type: 'input' }]);
  });

  it('single 格式：寫成一個值（範本的 LoadImage.image）', () => {
    const model: WorkflowModel = { ...withReferences, references: { paths: [['input_overrides', '15', 'image']], max: 1, format: 'single' } };
    expect(attachReferenceImages(call, model, ['abc.png']).args).toMatchObject({ input_overrides: { '15': { image: 'abc.png' } } });
  });

  it('正式設定檔的 Nano Banana Pro：一張參考圖放進 medias（07 實測）', () => {
    const model = loadWorkflowConfig(workflowsFile).models['nano-banana-pro'];
    if (!model) throw new Error('設定檔沒有 nano-banana-pro');
    expect(attachReferenceImages(call, model, ['sheet.png']).args.medias).toEqual([{ role: 'reference_image', name: 'sheet.png', subfolder: '', type: 'input' }]);
  });
});
