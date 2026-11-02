import { loadPromptFiles, promptsDir, renderPrompt } from '@templeyard/prompts';
import { describe, expect, it } from 'vitest';
import { templeViewVariables, type ViewPromptInput } from './viewPrompt.js';

const base: ViewPromptInput = {
  temple: { name: '板橋慈惠宮', district: '板橋區', deity: '天上聖母' },
  series: { visualStyle: '溫暖寫實' },
  view: { key: 'front_overview', name: '廟前全景', source: 'photo' },
  references: [{ viewName: '廟前全景' }, { viewName: '正殿內部' }, { viewName: null }],
  appearanceLocks: ['red swallowtail roof ridge with cut-porcelain dragons', 'grey granite dragon columns'],
  lighting: '黃昏',
  instruction: null,
};

describe('temple-view 的變數', () => {
  it('寺廟、視角、來源、光線、系列風格照欄位帶入', () => {
    expect(templeViewVariables(base)).toMatchObject({
      temple: {
        name: '板橋慈惠宮',
        district: '板橋區',
        deity: '天上聖母',
        lighting: '黃昏',
        appearanceLocks: 'red swallowtail roof ridge with cut-porcelain dragons; grey granite dragon columns',
      },
      view: { key: 'front_overview', name: '廟前全景', source: '依照片' },
      series: { style: '溫暖寫實' },
    });
  });

  it('參考照片依送入順序編號：同一個視角的照片負責地理與建築外觀，其他只負責建築外觀', () => {
    expect(templeViewVariables(base).photos).toBe(
      'Image 1（地理、建築外觀）：廟前全景；Image 2（建築外觀）：正殿內部；Image 3（建築外觀）：沒有指定視角的照片',
    );
  });

  it('AI 推測的視角先說明沒有這個視角的照片', () => {
    const vars = templeViewVariables({
      ...base,
      view: { key: 'courtyard', name: '廟埕', source: 'ai_inferred' },
      references: [{ viewName: '廟前全景' }],
    });
    expect(vars.view).toMatchObject({ source: 'AI 推測' });
    expect(vars.photos).toBe('沒有這個視角的照片；Image 1（建築外觀）：廟前全景');
  });

  it('修改指令有值才帶入；沒有外觀規範時留白', () => {
    expect(templeViewVariables({ ...base, instruction: '燈光暗一點' }).instruction).toBe('燈光暗一點');
    const vars = templeViewVariables({ ...base, appearanceLocks: [] });
    expect(vars.instruction ?? '').toBe('');
    expect((vars.temple as Record<string, unknown>).appearanceLocks ?? '').toBe('');
  });

  it('帶入後 temple-view 的必填變數都有值', () => {
    const prompt = loadPromptFiles(promptsDir).get('temple-view');
    if (!prompt) throw new Error('找不到 temple-view');

    const { missing, request } = renderPrompt(prompt, templeViewVariables(base), { model: 'nano-banana-pro' });

    expect(missing).toEqual([]);
    expect(request.messages[0]?.content).toContain('外觀規範（逐字帶入）：red swallowtail roof ridge with cut-porcelain dragons; grey granite dragon columns');
  });
});
