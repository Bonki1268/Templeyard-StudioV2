import { describe, expect, it } from 'vitest';
import {
  FRAMES_NOT_OPEN,
  PlanInputError,
  applyRevision,
  checkPlan,
  countSpeechChars,
  createPlanVersionSchema,
  diffShots,
  estimateDialogueSec,
  formatClock,
  missingViewName,
  missingViews,
  moveBoundary,
  planOutputSchema,
  planTargetSec,
  planVersionLabel,
  shotInputSchema,
  shotTitle,
  shotsFromOutput,
  supplementalViewKey,
  withTimeline,
  type PlanRules,
  type Shot,
} from './plans.js';

const rules: PlanRules = { targetSec: 30, minGenerationSec: 3, videoModelLabel: 'Gemini Omni 1.1 Flash' };

function shot(overrides: Partial<Shot> & { shotKey: string; seq: number; durationSec: number }): Shot {
  return {
    startSec: 0,
    shotSize: '中景',
    cameraMove: '固定',
    cameraSpeed: '',
    cameraAngle: '',
    description: '廟前全景',
    actionStart: '',
    actionEnd: '',
    viewKey: 'front_overview',
    lighting: '',
    characters: [],
    dialogue: '',
    speaker: '',
    subtitle: '',
    photoId: null,
    keyframesEnabled: false,
    keyframeTimes: [],
    customPrompt: null,
    factSources: [],
    dialogueEstimateSec: null,
    ...overrides,
  };
}

describe('對白估時（暫以每秒約 4 字，含開口前與說完後各 0.5 秒）', () => {
  it('只算文字與數字，不算標點與空白', () => {
    expect(countSpeechChars('媽祖婆保佑大家平安。')).toBe(9);
    expect(countSpeechChars('  第 3 格，OK！ ')).toBe(5);
  });

  it.each([
    ['媽祖婆保佑大家平安。', 3.3],
    ['媽祖在大浪裡現身，指引漁船平安回到淡水河口。', 6],
    ['平安', 1.5],
  ])('「%s」估 %s 秒（無條件進位到 0.1 秒）', (text, seconds) => {
    expect(estimateDialogueSec(text)).toBe(seconds);
  });

  it('沒有台詞時沒有估時', () => {
    expect(estimateDialogueSec('')).toBeNull();
    expect(estimateDialogueSec('……！')).toBeNull();
  });
});

describe('目標長度', () => {
  // 使用者 2026-11-05 提出：系列不再設定秒數，只看問卷的「長度」
  it.each([
    ['20 秒', 20],
    ['15 秒', 15],
    ['30 秒', 30],
  ] as const)('問卷的「長度」選「%s」：目標 %i 秒', (choice, sec) => {
    expect(planTargetSec(choice)).toBe(sec);
  });

  it.each([
    ['問卷沒有選長度', null],
    ['自己寫的看不懂', '看情況'],
  ] as const)('%s：由系統決定，用上限 30 秒', (_name, choice) => {
    expect(planTargetSec(choice)).toBe(30);
  });

  it('不超過 30 秒', () => {
    expect(planTargetSec('45 秒')).toBe(30);
  });
});

describe('秒數檢查', () => {
  const base = [
    shot({ shotKey: 'a', seq: 1, durationSec: 6 }),
    shot({ shotKey: 'b', seq: 2, durationSec: 8, dialogue: '媽祖婆保佑大家平安。' }),
    shot({ shotKey: 'c', seq: 3, durationSec: 2 }),
  ];

  it('全部通過：沒有擋住生成的原因；總長度與目標長度', () => {
    const check = checkPlan(base, rules);
    expect(check.blocking).toEqual([]);
    expect(check.totalSec).toBe(16);
    expect(check.targetSec).toBe(30);
    expect(check.shots.b?.dialogueEstimateSec).toBe(3.3);
    expect(check.shots.b?.dialogueOverflow).toBe(false);
  });

  it('總長度超過目標長度', () => {
    const check = checkPlan([...base, shot({ shotKey: 'd', seq: 4, durationSec: 20 })], rules);
    expect(check.blocking).toContain('總長度 36 秒，超過目標長度 30 秒');
  });

  it('目標長度比 30 秒短時，以目標長度檢查', () => {
    expect(checkPlan(base, { ...rules, targetSec: 15 }).blocking).toContain('總長度 16 秒，超過目標長度 15 秒');
  });

  it('短於最短生成長度：提醒會裁切與計費，不擋住生成', () => {
    const check = checkPlan(base, rules);
    expect(check.shots.c?.shortWarning).toBe('短於 Gemini Omni 1.1 Flash 最短生成長度 3 秒：會生成 3 秒再裁切，裁掉的 1 秒照樣計費');
    expect(check.blocking.some((reason) => reason.startsWith('第 3 格'))).toBe(false);
  });

  it('最短生成長度待實測時不提醒', () => {
    expect(checkPlan(base, { ...rules, minGenerationSec: null }).shots.c?.shortWarning).toBeNull();
  });

  it('對白估時超過秒數：對白放不下，擋住生成', () => {
    const check = checkPlan([shot({ shotKey: 'a', seq: 1, durationSec: 2, dialogue: '媽祖在大浪裡現身，指引漁船平安回到淡水河口。' })], rules);
    expect(check.shots.a).toMatchObject({ dialogueEstimateSec: 6, dialogueOverflow: true });
    expect(check.blocking).toContain('第 1 格：對白放不下');
  });

  it('對白估時剛好等於秒數時放得下', () => {
    const check = checkPlan([shot({ shotKey: 'a', seq: 1, durationSec: 2, dialogue: '平安' })], rules);
    expect(check.shots.a?.dialogueOverflow).toBe(false);
  });

  it.each([
    [{ description: '  ' }, '第 1 格：還沒有畫面內容'],
    [{ viewKey: '' }, '第 1 格：還沒有選場景視角'],
    [{ viewKey: 'missing:後殿' }, '第 1 格：缺少視角「後殿」'],
    [{ durationSec: 0 }, '第 1 格：每格至少 1 秒'],
  ])('%o：%s', (overrides, reason) => {
    const check = checkPlan([shot({ shotKey: 'a', seq: 1, durationSec: 3, ...overrides })], rules);
    expect(check.blocking).toContain(reason);
  });

  it('缺少的視角記在這一格', () => {
    expect(checkPlan([shot({ shotKey: 'a', seq: 1, durationSec: 3, viewKey: 'missing:後殿' })], rules).shots.a?.missingView).toBe('後殿');
  });

  it('擋住生成的原因不包含「精緻圖生成將在之後的版本開放」（那是畫面加上的）', () => {
    expect(checkPlan(base, rules).blocking).not.toContain(FRAMES_NOT_OPEN);
  });
});

describe('時間與標題', () => {
  it('時間格式', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(7)).toBe('0:07');
    expect(formatClock(30)).toBe('0:30');
    expect(formatClock(75)).toBe('1:15');
  });

  it('卡片標題「序號｜開始–結束（秒數）」', () => {
    expect(shotTitle({ seq: 3, startSec: 7, durationSec: 3 })).toBe('3｜0:07–0:10（3 秒）');
  });

  it('依順序重算序號與開始秒數', () => {
    expect(withTimeline([{ durationSec: 6 }, { durationSec: 8 }, { durationSec: 2 }])).toEqual([
      { durationSec: 6, seq: 1, startSec: 0 },
      { durationSec: 8, seq: 2, startSec: 6 },
      { durationSec: 2, seq: 3, startSec: 14 },
    ]);
  });

  it('缺少的視角名稱', () => {
    expect(missingViewName('missing:後殿')).toBe('後殿');
    expect(missingViewName('front_overview')).toBeNull();
  });
});

describe('拖曳時間軸的邊界', () => {
  it('往後移：前一格變長、後一格變短，總長不變', () => {
    expect(moveBoundary([6, 8, 2], 0, 2)).toEqual([8, 6, 2]);
  });

  it('往前移：前一格變短、後一格變長', () => {
    expect(moveBoundary([6, 8, 2], 1, -3)).toEqual([6, 5, 5]);
  });

  it('任一格不能短於 1 秒，超過時停在 1 秒', () => {
    expect(moveBoundary([6, 8, 2], 1, -10)).toEqual([6, 1, 9]);
    expect(moveBoundary([6, 8, 2], 1, 10)).toEqual([6, 9, 1]);
  });

  it('不存在的邊界不改動', () => {
    expect(moveBoundary([6, 8], 1, 1)).toEqual([6, 8]);
  });
});

describe('Agent 產生的方案', () => {
  const output = planOutputSchema.parse({
    title: '媽祖顯靈',
    styleNote: '溫暖寫實',
    characters: [{ name: '阿嬤' }],
    shots: [
      { seq: 2, durationSec: 7.6, shotSize: '中景', cameraMove: '推', description: '阿嬤在廟埕', actionStart: '站著', viewKey: 'courtyard', subtitle: '平安', dialogue: '平安', speaker: '阿嬤', characters: ['阿嬤'] },
      { seq: 1, durationSec: 0.3, shotSize: '遠景', cameraMove: '固定', description: '廟前全景', actionStart: '', viewKey: 'front_overview', subtitle: '' },
    ],
  });

  it('依序號排序，秒數四捨五入到整數、至少 1 秒，沒有的欄位用空白', () => {
    const shots = shotsFromOutput(output);
    expect(shots.map((s) => [s.viewKey, s.durationSec])).toEqual([
      ['front_overview', 1],
      ['courtyard', 8],
    ]);
    expect(shots[1]).toMatchObject({ dialogue: '平安', speaker: '阿嬤', characters: ['阿嬤'], actionEnd: '', lighting: '' });
    expect(shots[0]?.shotKey).toBeUndefined();
  });

  it('景別不在遠景、中景、特寫，或沒有任何一格：格式不正確', () => {
    expect(planOutputSchema.safeParse({ title: 't', styleNote: 's', shots: [] }).success).toBe(false);
    const bad = { title: 't', styleNote: 's', shots: [{ seq: 1, durationSec: 3, shotSize: '大特寫', cameraMove: '', description: 'x', actionStart: '', viewKey: 'v', subtitle: '' }] };
    expect(planOutputSchema.safeParse(bad).success).toBe(false);
  });
});

describe('對話修改', () => {
  const drafts = [
    shotInputSchema.parse({ shotKey: 'a', durationSec: 6, shotSize: '遠景', description: '廟前' }),
    shotInputSchema.parse({ shotKey: 'b', durationSec: 8, shotSize: '中景', description: '阿嬤' }),
  ];

  it('依序號套用修改，其他欄位不變', () => {
    const revised = applyRevision(drafts, [{ seq: 1, shotSize: '特寫', durationSec: 5 }]);
    expect(revised[0]).toMatchObject({ shotKey: 'a', shotSize: '特寫', durationSec: 5, description: '廟前' });
    expect(revised[1]).toEqual(drafts[1]);
  });

  it('沒有這一格：說明方案沒有第 N 格', () => {
    expect(() => applyRevision(drafts, [{ seq: 9, shotSize: '特寫' }])).toThrow(new PlanInputError('方案沒有第 9 格'));
  });
});

describe('兩版的差異', () => {
  const v1 = [shot({ shotKey: 'a', seq: 1, durationSec: 6 }), shot({ shotKey: 'b', seq: 2, durationSec: 8 }), shot({ shotKey: 'c', seq: 3, durationSec: 2 })];

  it('改了哪幾格（依新版本的序號）', () => {
    const v2 = [v1[0]!, { ...v1[1]!, shotSize: '特寫' as const }, { ...v1[2]!, description: '香爐' }];
    expect(diffShots(v1, v2)).toEqual({ changedShotKeys: ['b', 'c'], summary: '改了第 2、3 格' });
  });

  it('新增與刪除', () => {
    const v2 = [v1[0]!, v1[1]!, shot({ shotKey: 'd', seq: 3, durationSec: 3 })];
    expect(diffShots(v1, v2)).toEqual({ changedShotKeys: ['d'], summary: '改了第 3 格；刪除了 1 格' });
  });

  it('只調整順序', () => {
    const v2 = [{ ...v1[1]!, seq: 1 }, { ...v1[0]!, seq: 2 }, v1[2]!];
    expect(diffShots(v1, v2)).toEqual({ changedShotKeys: [], summary: '調整了順序' });
  });

  it('沒有改動', () => {
    expect(diffShots(v1, v1)).toEqual({ changedShotKeys: [], summary: '沒有改動' });
  });
});

describe('修改方案的請求', () => {
  it('依最新版本修改，或回到舊版，二擇一', () => {
    expect(createPlanVersionSchema.safeParse({ baseVersion: 1, revertTo: 1 }).success).toBe(true);
    expect(createPlanVersionSchema.safeParse({ baseVersion: 1, shots: [{ durationSec: 3, shotSize: '中景' }] }).success).toBe(true);
    expect(createPlanVersionSchema.safeParse({ baseVersion: 1 }).success).toBe(false);
  });

  it('每格至少 1 秒；至少要有一格', () => {
    expect(createPlanVersionSchema.safeParse({ baseVersion: 1, shots: [{ durationSec: 0, shotSize: '中景' }] }).error?.issues[0]?.message).toBe('每格至少 1 秒');
    expect(createPlanVersionSchema.safeParse({ baseVersion: 1, shots: [] }).error?.issues[0]?.message).toBe('方案至少要有一格');
  });
});

describe('版本選單的文字', () => {
  const diff = { changedShotKeys: [], summary: '' };
  it.each([
    [{ version: 1, source: 'agent' as const, diff }, '第 1 版（Agent 產生）'],
    [{ version: 2, source: 'user_edit' as const, diff }, '第 2 版（手動修改）'],
    [{ version: 3, source: 'chat_edit' as const, diff }, '第 3 版（對話修改）'],
    [{ version: 4, source: 'revert' as const, diff: { ...diff, revertedFrom: 1 } }, '第 4 版（回到第 1 版）'],
  ])('%o → %s', (version, label) => {
    expect(planVersionLabel(version)).toBe(label);
  });
});

describe('補充視角', () => {
  it('方案用到、定裝版還沒有的視角名稱，不重複，依序號', () => {
    expect(missingViews([{ viewKey: 'front_overview' }, { viewKey: 'missing:後殿' }, { viewKey: 'missing:老樹' }, { viewKey: 'missing:後殿' }])).toEqual(['後殿', '老樹']);
    expect(missingViews([{ viewKey: 'front_overview' }])).toEqual([]);
  });

  it('補充視角的 viewKey', () => {
    expect(supplementalViewKey(' 後殿 ')).toBe('custom:後殿');
  });
});
