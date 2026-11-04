import { describe, expect, it } from 'vitest';
import {
  QUESTIONNAIRE_QUESTIONS,
  QuestionnaireInputError,
  answerSummaryLines,
  defaultsFromAnswers,
  generateQuestionnaireInputSchema,
  prefillAnswers,
  resolveSubmittedAnswers,
  type QuestionnaireAnswer,
} from './questionnaire.js';

const ALL = QUESTIONNAIRE_QUESTIONS.map((q) => q.id);

function tool(questionIds: string[] = ALL, prefill: unknown[] = []) {
  return generateQuestionnaireInputSchema.parse({ questionIds, prefill });
}

function answerOf(answers: QuestionnaireAnswer[], id: string) {
  const found = answers.find((a) => a.questionId === id);
  if (!found) throw new Error(`沒有這一題：${id}`);
  return found;
}

describe('題庫', () => {
  it('依規格書的題目表，共 9 題；想講的故事、一定要出現的照片、一定要說到的事是每支影片不同的題目', () => {
    expect(QUESTIONNAIRE_QUESTIONS.map((q) => q.title)).toEqual([
      '想講的故事',
      '這支影片想達成什麼？',
      '主要觀眾是誰？',
      '故事怎麼說？',
      '角色',
      '語氣',
      '長度',
      '一定要出現的照片',
      '一定要說到的事',
    ]);
    expect(QUESTIONNAIRE_QUESTIONS.filter((q) => q.perVideo).map((q) => q.title)).toEqual([
      '想講的故事',
      '一定要出現的照片',
      '一定要說到的事',
    ]);
  });

  it('Agent 挑的題目不在題庫時，工具輸入不合法', () => {
    expect(generateQuestionnaireInputSchema.safeParse({ questionIds: ['not_a_question'] }).success).toBe(false);
    expect(generateQuestionnaireInputSchema.safeParse({ questionIds: [] }).success).toBe(false);
  });
});

describe('預填問卷', () => {
  it('Agent 依創作輸入預填的答案標示「你的輸入」', () => {
    const answers = prefillAnswers({
      tool: tool(ALL, [{ questionId: 'story', custom: '講媽祖顯靈救漁民的故事' }]),
      seriesDefaults: null,
    });
    expect(answerOf(answers, 'story')).toEqual({ questionId: 'story', custom: '講媽祖顯靈救漁民的故事', source: 'user' });
  });

  it('只留 Agent 挑的題目，依題庫順序', () => {
    const answers = prefillAnswers({ tool: tool(['tone', 'story', 'goal']), seriesDefaults: null });
    expect(answers.map((a) => a.questionId)).toEqual(['story', 'goal', 'tone']);
  });

  it('沒有預填來源的題目留白，標示「系統將會選擇」', () => {
    const answers = prefillAnswers({ tool: tool(), seriesDefaults: null });
    expect(answerOf(answers, 'audience')).toEqual({ questionId: 'audience', source: 'system' });
  });

  it('系列問卷預設值排在創作輸入之後：Agent 有預填時用 Agent 的', () => {
    const answers = prefillAnswers({
      tool: tool(ALL, [{ questionId: 'tone', choice: '懸疑' }]),
      seriesDefaults: { tone: { choice: '溫暖' }, audience: { choice: '外地遊客' } },
    });
    expect(answerOf(answers, 'tone')).toMatchObject({ choice: '懸疑', source: 'user' });
    expect(answerOf(answers, 'audience')).toMatchObject({ choice: '外地遊客', source: 'series_default' });
  });

  it('系列問卷預設值的「自己寫」也會帶入', () => {
    const answers = prefillAnswers({ tool: tool(), seriesDefaults: { goal: { custom: '讓年輕人認識媽祖' } } });
    expect(answerOf(answers, 'goal')).toEqual({ questionId: 'goal', custom: '讓年輕人認識媽祖', source: 'series_default' });
  });

  it('每支影片不同的題目不使用系列問卷預設值', () => {
    const answers = prefillAnswers({ tool: tool(), seriesDefaults: { story: { custom: '上一支影片的故事' } } });
    expect(answerOf(answers, 'story')).toEqual({ questionId: 'story', source: 'system' });
  });

  // 使用者 2026-11-05 提出：系列不再設定秒數，「長度」只看系列問卷預設值，沒有就留白由系統選擇
  it('沒有系列問卷預設值時，「長度」留白，標示由系統選擇', () => {
    const answers = prefillAnswers({ tool: tool(), seriesDefaults: null });
    expect(answerOf(answers, 'length')).toEqual({ questionId: 'length', source: 'system' });
  });

  it('系列問卷預設值有長度時帶入，標示「系列預設」', () => {
    const answers = prefillAnswers({ tool: tool(), seriesDefaults: { length: { choice: '15 秒' } } });
    expect(answerOf(answers, 'length')).toEqual({ questionId: 'length', choice: '15 秒', source: 'series_default' });
  });

  it('Agent 預填的選項不在題目的選項裡時不採用，往下一個來源找', () => {
    const answers = prefillAnswers({
      tool: tool(ALL, [{ questionId: 'tone', choice: '搞笑' }]),
      seriesDefaults: { tone: { choice: '溫暖' } },
    });
    expect(answerOf(answers, 'tone')).toMatchObject({ choice: '溫暖', source: 'series_default' });
  });

  it('Agent 的預填空白時當成沒有預填', () => {
    const answers = prefillAnswers({ tool: tool(ALL, [{ questionId: 'story', custom: '   ' }]), seriesDefaults: null });
    expect(answerOf(answers, 'story')).toEqual({ questionId: 'story', source: 'system' });
  });
});

describe('送出問卷', () => {
  const current: QuestionnaireAnswer[] = [
    { questionId: 'story', custom: '講媽祖顯靈救漁民的故事', source: 'user' },
    { questionId: 'audience', choice: '外地遊客', source: 'series_default' },
    { questionId: 'tone', source: 'system' },
    { questionId: 'photos', source: 'system' },
  ];

  it('和預填相同的答案保留原本的來源；改過的是「你的輸入」；沒有送的題目當成留白', () => {
    const answers = resolveSubmittedAnswers(
      current,
      [
        { questionId: 'story', custom: '講媽祖顯靈救漁民的故事' },
        { questionId: 'audience', choice: '外地遊客' },
        { questionId: 'tone', choice: '溫暖' },
      ],
      [],
    );
    expect(answers).toEqual([
      { questionId: 'story', custom: '講媽祖顯靈救漁民的故事', source: 'user' },
      { questionId: 'audience', choice: '外地遊客', source: 'series_default' },
      { questionId: 'tone', choice: '溫暖', source: 'user' },
      { questionId: 'photos', source: 'system' },
    ]);
  });

  it('清掉預填的答案，改標示「系統將會選擇」', () => {
    const answers = resolveSubmittedAnswers(current, [{ questionId: 'audience' }], []);
    expect(answers[1]).toEqual({ questionId: 'audience', source: 'system' });
  });

  it('自己寫的文字去掉前後空白；只有空白時當成留白', () => {
    const answers = resolveSubmittedAnswers(current, [{ questionId: 'story', custom: '  新的故事  ' }, { questionId: 'tone', custom: '   ' }], []);
    expect(answers[0]).toEqual({ questionId: 'story', custom: '新的故事', source: 'user' });
    expect(answers[2]).toEqual({ questionId: 'tone', source: 'system' });
  });

  it('勾選這支影片的照片', () => {
    const answers = resolveSubmittedAnswers(current, [{ questionId: 'photos', photoIds: ['p1'] }], ['p1', 'p2']);
    expect(answers[3]).toEqual({ questionId: 'photos', photoIds: ['p1'], source: 'user' });
  });

  it.each([
    ['選項不在這一題', [{ questionId: 'tone', choice: '搞笑' }], '請從選項中選擇', 'tone'],
    ['同時選了選項又自己寫', [{ questionId: 'tone', choice: '溫暖', custom: '再溫暖一點' }], '選項和自己寫只能擇一', 'tone'],
    ['照片不是這支影片的', [{ questionId: 'photos', photoIds: ['other'] }], '找不到這張照片', 'photos'],
    ['題目不在這份問卷', [{ questionId: 'goal', choice: '介紹歷史' }], '這份問卷沒有這一題', 'goal'],
    ['文字題給了選項', [{ questionId: 'story', choice: '介紹歷史' }], '請從選項中選擇', 'story'],
  ])('%s：拒絕並說明是哪一題', (_label, input, message, questionId) => {
    const run = () => resolveSubmittedAnswers(current, input, ['p1']);
    expect(run).toThrow(QuestionnaireInputError);
    expect(run).toThrow(message);
    try {
      run();
    } catch (error: unknown) {
      expect(error).toMatchObject({ questionId });
    }
  });
});

describe('系列問卷預設值', () => {
  it('排除每支影片不同的題目與留白的題目，保留選項或自己寫', () => {
    const defaults = defaultsFromAnswers([
      { questionId: 'story', custom: '故事', source: 'user' },
      { questionId: 'goal', custom: '讓年輕人認識媽祖', source: 'user' },
      { questionId: 'audience', choice: '外地遊客', source: 'user' },
      { questionId: 'tone', source: 'system' },
      { questionId: 'length', choice: '30 秒', source: 'series_default' },
      { questionId: 'photos', photoIds: ['p1'], source: 'user' },
      { questionId: 'mustSay', custom: '媽祖救起漁船', source: 'user' },
    ]);
    expect(defaults).toEqual({
      goal: { custom: '讓年輕人認識媽祖' },
      audience: { choice: '外地遊客' },
      length: { choice: '30 秒' },
    });
  });
});

describe('答案摘要', () => {
  it('每題一行「題目：答案」；留白寫「系統將會選擇」；照片寫張數', () => {
    expect(
      answerSummaryLines([
        { questionId: 'story', custom: '講媽祖顯靈救漁民的故事', source: 'user' },
        { questionId: 'goal', source: 'system' },
        { questionId: 'audience', choice: '外地遊客', source: 'user' },
        { questionId: 'photos', photoIds: ['p1', 'p2'], source: 'user' },
      ]),
    ).toEqual(['想講的故事：講媽祖顯靈救漁民的故事', '這支影片想達成什麼？：系統將會選擇', '主要觀眾是誰？：外地遊客', '一定要出現的照片：2 張']);
  });
});
