import { MissingLocksError, composeFinalPrompt, loadPromptFiles, promptsDir, renderPrompt } from '@templeyard/prompts';
import { describe, expect, it } from 'vitest';
import { createFakeWriter, echoWriterResponse } from '../../../../tests/fakes/claude/fake-writer.js';
import { frameLocks, refinedFrameVariables } from './framePrompt.js';

// 06 第 8 階段完成條件：連續性鎖確實出現在後續指令中（指令組裝測試）

const grandma = { name: '阿嬤', continuityLocks: ['grey cotton cardigan', 'silver hairpin'] };
const shot = {
  seq: 2,
  description: '阿嬤站在廟埕左側，面向廟門',
  actionStart: '阿嬤雙手合十',
  actionEnd: '阿嬤抬頭看廟門',
  shotSize: '中景' as const,
  cameraAngle: '平視',
  lighting: '清晨',
};

function variables(role: 'first' | 'last' = 'first') {
  return refinedFrameVariables({
    shot,
    role,
    characters: [grandma],
    viewName: '廟前全景',
    appearanceLocks: ['red-tiled swallowtail roof'],
    references: ['Image 1：阿嬤定裝圖', 'Image 2：廟前全景'],
    seriesStyle: '溫暖寫實',
  });
}

describe('這一格的連續性鎖', () => {
  it('出現的角色的鎖加上寺廟的外觀規範，不重複', () => {
    expect(frameLocks([grandma, { name: '阿公', continuityLocks: ['grey cotton cardigan', 'straw hat'] }], ['red-tiled swallowtail roof'])).toEqual([
      'grey cotton cardigan',
      'silver hairpin',
      'straw hat',
      'red-tiled swallowtail roof',
    ]);
  });
});

describe('精緻圖的變數', () => {
  it('首格用起點、末格用終點', () => {
    expect(variables('first')).toMatchObject({ frame: { role: '首格', state: '阿嬤雙手合十' } });
    expect(variables('last')).toMatchObject({ frame: { role: '末格', state: '阿嬤抬頭看廟門' } });
  });

  it('角色的連續性鎖、寺廟的外觀規範、視角、參考圖都帶進變數', () => {
    expect(variables()).toMatchObject({
      shot: { seq: 2, description: '阿嬤站在廟埕左側，面向廟門', shotSize: '中景', cameraAngle: '平視', characters: '阿嬤', lighting: '清晨' },
      character: { locks: 'grey cotton cardigan; silver hairpin' },
      view: { name: '廟前全景' },
      temple: { appearanceLocks: 'red-tiled swallowtail roof' },
      references: 'Image 1：阿嬤定裝圖；Image 2：廟前全景',
      series: { style: '溫暖寫實' },
    });
  });
});

describe('指令組裝：連續性鎖逐字出現在最終指令', () => {
  const file = loadPromptFiles(promptsDir).get('refined-frame');

  it('refined-frame 節點帶入變數後，送給撰寫者的內容包含每一條鎖', () => {
    if (!file) throw new Error('找不到 refined-frame');
    const { missing, request } = renderPrompt(file, variables());
    expect(missing).toEqual([]);
    for (const lock of frameLocks([grandma], ['red-tiled swallowtail roof'])) expect(request.messages[0]?.content).toContain(lock);
  });

  it('撰寫者照實寫進去時，最終指令包含每一條鎖', async () => {
    if (!file) throw new Error('找不到 refined-frame');
    const { request } = renderPrompt(file, variables());
    const locks = frameLocks([grandma], ['red-tiled swallowtail roof']);
    const composed = await composeFinalPrompt({ request, locks, writer: createFakeWriter(echoWriterResponse) });
    for (const lock of locks) expect(composed.prompt).toContain(lock);
  });

  it('撰寫者漏掉鎖時要求重寫一次，仍然漏掉就回報錯誤，不送出', async () => {
    if (!file) throw new Error('找不到 refined-frame');
    const { request } = renderPrompt(file, variables());
    const writer = createFakeWriter(() => ({ prompt: 'A grandmother in a temple courtyard.' }));
    await expect(composeFinalPrompt({ request, locks: frameLocks([grandma], []), writer })).rejects.toBeInstanceOf(MissingLocksError);
    expect(writer.calls).toHaveLength(2);
  });
});
