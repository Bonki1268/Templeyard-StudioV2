import { findAssistField, type AssistField } from '@templeyard/shared';
import { describe, expect, it } from 'vitest';
import {
  ASSIST_ROLE,
  AssistOutputError,
  buildAssistRequest,
  characterDesignVariables,
  copyPolishVariables,
  parseAssistOutput,
  type AssistContext,
} from './assist.js';

function field(key: string): AssistField {
  const found = findAssistField(key);
  if (!found) throw new Error(`沒有這個欄位：${key}`);
  return found;
}

const base: AssistContext = {
  field: field('creative.input'),
  userInput: '媽祖救漁民',
  temple: { name: '板橋慈惠宮', district: '板橋區', deity: '天上聖母', builtYear: 1853 },
  userTempleNotes: '清代由漳州移民建廟',
  series: { visualStyle: '寫實電影感、清晨暖光', direction: '歷史故事', durationSec: 30 },
  creativeInput: null,
  viewName: null,
  questionTitle: null,
};

describe('通用的輔助撰寫請求', () => {
  it('system 說明角色、內容與宗教規則、輸出格式', () => {
    const { system } = buildAssistRequest(base);
    expect(system).toContain(ASSIST_ROLE);
    expect(system).toContain('不可新增沒有來源的寺廟事實');
    expect(system).toContain('不得對神明不敬');
    expect(system).toContain('{"suggestion"');
  });

  it('user 列出要寫的欄位、使用者的輸入、寺廟資料、使用者提供的歷史與系列設定', () => {
    const { user } = buildAssistRequest(base);
    for (const text of ['創作需求', '媽祖救漁民', '板橋慈惠宮', '天上聖母', '清代由漳州移民建廟', '寫實電影感、清晨暖光', '歷史故事']) {
      expect(user).toContain(text);
    }
  });

  it('使用者留白時，請 AI 依資料寫一版', () => {
    expect(buildAssistRequest({ ...base, userInput: '  ' }).user).toContain('使用者沒有輸入，請依資料寫一版');
  });

  it('沒有的資料不列出（系列表單還沒有寺廟）', () => {
    const { user } = buildAssistRequest({
      ...base,
      field: field('series.visualStyle'),
      temple: null,
      userTempleNotes: '',
      series: null,
    });
    expect(user).toContain('系列的整體視覺風格');
    expect(user).not.toContain('寺廟：');
    expect(user).not.toContain('使用者提供的寺廟歷史');
  });

  it('定裝版的修改指令帶上視角名稱；問卷的「或自己寫」帶上題目', () => {
    expect(buildAssistRequest({ ...base, field: field('templeView.instruction'), viewName: '廟前全景' }).user).toContain('廟前全景');
    expect(buildAssistRequest({ ...base, field: field('questionnaire.custom'), questionTitle: '語氣' }).user).toContain('語氣');
  });

  it('問卷的欄位帶上創作輸入', () => {
    expect(buildAssistRequest({ ...base, field: field('questionnaire.mustSay'), creativeInput: '講媽祖顯靈' }).user).toContain('講媽祖顯靈');
  });
});

describe('copy-polish（想講的故事）的變數', () => {
  it('對應 prompt-studio/prompts/copy-polish.json 的變數清單', () => {
    expect(copyPolishVariables({ ...base, field: field('questionnaire.story'), userInput: '媽祖救起漁船' })).toEqual({
      temple: { name: '板橋慈惠宮', district: '板橋區', deity: '天上聖母', builtYear: '1853', history: '清代由漳州移民建廟' },
      series: { style: '寫實電影感、清晨暖光', direction: '歷史故事' },
      maxChars: '200',
      instruction: '',
      story: '媽祖救起漁船',
    });
  });

  it('沒有創建年、使用者沒有提供歷史時留空字串', () => {
    const vars = copyPolishVariables({ ...base, userTempleNotes: '', temple: { ...base.temple!, builtYear: null } });
    expect(vars.temple).toMatchObject({ builtYear: '', history: '' });
  });
});

describe('解析 AI 建議', () => {
  it('通用指令取 suggestion；copy-polish 取 polished；去掉前後空白', () => {
    expect(parseAssistOutput(' {"suggestion": " 一段建議 "} ', 'generic')).toBe('一段建議');
    expect(parseAssistOutput('{"polished": "整理後的故事", "notes": "說明"}', 'copy-polish')).toBe('整理後的故事');
  });

  it('接受 ```json 程式碼區塊', () => {
    expect(parseAssistOutput('```json\n{"suggestion": "包起來的建議"}\n```', 'generic')).toBe('包起來的建議');
  });

  it.each([
    ['不是 JSON', '這不是 JSON', 'generic'],
    ['少了 suggestion', '{"text": "x"}', 'generic'],
    ['建議是空的', '{"suggestion": "  "}', 'generic'],
    ['copy-polish 少了 polished', '{"suggestion": "x"}', 'copy-polish'],
  ] as const)('%s：說明格式不正確', (_label, text, kind) => {
    expect(() => parseAssistOutput(text, kind)).toThrow(new AssistOutputError('AI 建議的格式不正確，請再試一次'));
  });
});

describe('角色的外觀描述與連續性鎖（character-design 節點）', () => {
  it('變數對應 prompt-studio/prompts/character-design.json：使用者的輸入當作角色構想', () => {
    expect(
      characterDesignVariables({ ...base, field: field('character.description'), characterName: '阿嬤', seriesName: '新北廟宇巡禮', userInput: '七十多歲的阿嬤' }),
    ).toEqual({
      character: { name: '阿嬤' },
      idea: '七十多歲的阿嬤',
      series: { name: '新北廟宇巡禮', style: '寫實電影感、清晨暖光', direction: '歷史故事' },
      instruction: '',
    });
  });

  const output = '{"name":"阿嬤","description":"七十多歲的阿嬤，灰白短髮","identityAnchors":[],"look":"","continuityLocks":["grey cotton cardigan","silver hairpin"]}';

  it('外觀描述取 description；連續性鎖取 continuityLocks，一行一條', () => {
    expect(parseAssistOutput(output, 'character-description')).toBe('七十多歲的阿嬤，灰白短髮');
    expect(parseAssistOutput(output, 'character-locks')).toBe('grey cotton cardigan\nsilver hairpin');
  });

  it('沒有連續性鎖時格式不正確', () => {
    expect(() => parseAssistOutput('{"name":"阿嬤","description":"x","continuityLocks":[]}', 'character-locks')).toThrow(AssistOutputError);
  });
});
