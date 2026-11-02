import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PromptFile } from '@templeyard/shared';
import { describe, expect, it } from 'vitest';
import { loadPromptFiles } from './load.js';
import { promptsDir, repoRoot } from './paths.js';
import { renderPrompt } from './render.js';

// Prompt Studio 的組裝（管理頁預覽用）；實際送出的組裝必須和它一模一樣
type StudioLib = { render: (p: unknown, vars: unknown, options: { model?: string }) => unknown };
const studio = createRequire(import.meta.url)(path.join(repoRoot, 'prompt-studio', 'lib', 'prompt.js')) as StudioLib;

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(path.join(here, '__fixtures__', 'temple-view.nano-banana-pro.json'), 'utf8')) as {
  variables: Record<string, unknown>;
  model: string;
  expected: unknown;
};

/** 用每個變數的測試範例組成巢狀的變數物件 */
function exampleVariables(prompt: PromptFile): Record<string, unknown> {
  const vars: Record<string, unknown> = {};
  for (const variable of prompt.variables) {
    const keys = variable.name.split('.');
    let node = vars;
    for (const key of keys.slice(0, -1)) {
      node[key] ??= {};
      node = node[key] as Record<string, unknown>;
    }
    node[keys.at(-1) ?? ''] = variable.example;
  }
  return vars;
}

describe('組裝送給 AI 的內容', () => {
  it('寺廟定裝版＋Nano Banana Pro 的組裝結果固定（快照）', () => {
    const prompt = loadPromptFiles(promptsDir).get('temple-view');
    if (!prompt) throw new Error('找不到 temple-view');
    expect(renderPrompt(prompt, fixture.variables, { model: fixture.model })).toEqual(fixture.expected);
  });

  it('每個節點、每個模型寫法的組裝都和 Prompt Studio 的預覽相同', () => {
    for (const prompt of loadPromptFiles(promptsDir).values()) {
      const vars = exampleVariables(prompt);
      for (const model of ['', ...Object.keys(prompt.modelRules ?? {})]) {
        const options = model ? { model } : {};
        expect(renderPrompt(prompt, vars, options), `${prompt.id} ${model}`).toEqual(studio.render(prompt, vars, options));
      }
    }
  });

  it('缺少必填變數時列出來，留白的插入點變成空字串', () => {
    const prompt = loadPromptFiles(promptsDir).get('temple-view');
    if (!prompt) throw new Error('找不到 temple-view');

    const { missing, request } = renderPrompt(prompt, { temple: { name: '鄞山寺' } });

    expect(missing).toEqual(['view.name', 'view.source', 'photos', 'series.style']);
    expect(request.messages[0]?.content).toContain('寺廟：鄞山寺（，主祀）');
    expect(request.messages[0]?.content).not.toContain('{{');
  });

  it('指定的模型沒有寫法時，system 只有節點本身的規則', () => {
    const prompt = loadPromptFiles(promptsDir).get('temple-view');
    if (!prompt) throw new Error('找不到 temple-view');

    const { request } = renderPrompt(prompt, exampleVariables(prompt), { model: 'seedance-2.0' });

    expect(request.system).not.toContain('Nano Banana Pro 寫法');
    expect(request.target.model).toBe('seedance-2.0');
  });
});
