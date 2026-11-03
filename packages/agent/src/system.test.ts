import { QUESTIONNAIRE_QUESTIONS } from '@templeyard/shared';
import { describe, expect, it } from 'vitest';
import { AGENT_ROLE, buildAgentSystem, type AgentContext } from './system.js';

const context: AgentContext = {
  temple: { name: '板橋慈惠宮', district: '板橋區', deity: '天上聖母', builtYear: 1853 },
  userTempleNotes: '清代由漳州移民建廟',
  series: { name: '新北廟宇巡禮', visualStyle: '寫實電影感、清晨暖光', durationSec: 30, direction: '歷史故事' },
  models: { image: 'Nano Banana Pro', video: 'Gemini Omni 1.1 Flash' },
  questionnaireSubmitted: false,
};

describe('創作 Agent 的系統指令', () => {
  it('說明角色與回覆方式：先用一兩句說明下一步，再開啟問卷', () => {
    const system = buildAgentSystem(context);
    expect(system).toContain(AGENT_ROLE);
    expect(system).toContain('先用一兩句說明接下來要做什麼');
    expect(system).toContain('generate_questionnaire');
  });

  it('列出寺廟資料與使用者提供的歷史，並標示來源', () => {
    const system = buildAgentSystem(context);
    expect(system).toContain('板橋慈惠宮');
    expect(system).toContain('板橋區');
    expect(system).toContain('天上聖母');
    expect(system).toContain('1853');
    expect(system).toContain('來源：寺廟資料庫');
    expect(system).toContain('清代由漳州移民建廟');
    expect(system).toContain('來源：使用者提供');
  });

  it('使用者沒有提供歷史、寺廟沒有創建年時寫「沒有」，不留空白讓 Agent 自己補', () => {
    const system = buildAgentSystem({ ...context, userTempleNotes: '', temple: { ...context.temple, builtYear: null } });
    expect(system).toContain('使用者提供的寺廟歷史與簡介：沒有');
    expect(system).toContain('創建年：沒有');
  });

  it('列出系列設定與這支影片的模型', () => {
    const system = buildAgentSystem(context);
    for (const text of ['新北廟宇巡禮', '寫實電影感、清晨暖光', '30 秒', '歷史故事', 'Nano Banana Pro', 'Gemini Omni 1.1 Flash']) {
      expect(system).toContain(text);
    }
  });

  it('列出問卷題庫：每題的代號、題目與選項，並說明每支影片不同的題目', () => {
    const system = buildAgentSystem(context);
    for (const question of QUESTIONNAIRE_QUESTIONS) {
      expect(system).toContain(question.id);
      expect(system).toContain(question.title);
      for (const option of question.options) expect(system).toContain(option);
    }
    expect(system).toContain('每支影片不同');
  });

  it('寫明不能做的事：寺廟事實只引用提供的資料、不能更改模型、不能自行觸發付費生成', () => {
    const system = buildAgentSystem(context);
    expect(system).toContain('寺廟事實只能引用上面的資料');
    expect(system).toContain('不能更改這支影片的圖片與影片模型');
    expect(system).toContain('不能自行觸發付費生成');
    expect(system).toContain('繁體中文');
  });

  it('問卷已送出時說明不能重新產生問卷', () => {
    expect(buildAgentSystem(context)).not.toContain('問卷已送出');
    expect(buildAgentSystem({ ...context, questionnaireSubmitted: true })).toContain('問卷已送出，不能重新產生問卷');
  });
});
