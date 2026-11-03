import { z } from 'zod';

// 設定問卷（01 F7、規格書「4. 設定問卷」、05 questionnaires）

export type QuestionKind = 'choice' | 'text' | 'photos';

export type Question = {
  id: string;
  title: string;
  kind: QuestionKind;
  /** choice 題的選項；可另外「或自己寫」 */
  options: readonly string[];
  /** 每支影片不同的題目：不列入系列問卷預設值 */
  perVideo: boolean;
};

/** 固定題庫，依畫面上的順序（規格書「4. 設定問卷」的題目表） */
export const QUESTIONNAIRE_QUESTIONS = [
  { id: 'story', title: '想講的故事', kind: 'text', options: [], perVideo: true },
  { id: 'goal', title: '這支影片想達成什麼？', kind: 'choice', options: ['吸引參拜', '介紹歷史', '宣傳活動', '推薦景點'], perVideo: false },
  { id: 'audience', title: '主要觀眾是誰？', kind: 'choice', options: ['在地居民', '外地遊客', '年輕族群', '信眾'], perVideo: false },
  { id: 'narration', title: '故事怎麼說？', kind: 'choice', options: ['角色對鏡說話', '旁白敘述', '只有字幕'], perVideo: false },
  { id: 'character', title: '角色', kind: 'choice', options: ['沿用系列角色', '建立新角色', '不出現角色'], perVideo: false },
  { id: 'tone', title: '語氣', kind: 'choice', options: ['莊重', '溫暖', '輕鬆', '懸疑'], perVideo: false },
  { id: 'length', title: '長度', kind: 'choice', options: ['15 秒', '20 秒', '30 秒'], perVideo: false },
  { id: 'photos', title: '一定要出現的照片', kind: 'photos', options: [], perVideo: true },
  { id: 'mustSay', title: '一定要說到的事', kind: 'text', options: [], perVideo: true },
] as const satisfies readonly Question[];

export type QuestionId = (typeof QUESTIONNAIRE_QUESTIONS)[number]['id'];

export const QUESTION_IDS = QUESTIONNAIRE_QUESTIONS.map((q) => q.id) as [QuestionId, ...QuestionId[]];

export function findQuestion(id: string): Question | undefined {
  return QUESTIONNAIRE_QUESTIONS.find((q) => q.id === id);
}

/** 自己寫的文字上限 */
export const MAX_ANSWER_LENGTH = 500;

/** 答案來源（05：user／series_default／system） */
export const answerSourceSchema = z.enum(['user', 'series_default', 'system']);
export type AnswerSource = z.infer<typeof answerSourceSchema>;

/** 來源標籤的文字 */
export const ANSWER_SOURCE_LABELS: Record<AnswerSource, string> = {
  user: '你的輸入',
  series_default: '系列預設',
  system: '系統將會選擇',
};

export const questionnaireAnswerSchema = z.object({
  questionId: z.string(),
  choice: z.string().optional(),
  custom: z.string().optional(),
  /** 「一定要出現的照片」勾選的照片 */
  photoIds: z.array(z.string()).optional(),
  source: answerSourceSchema,
  systemReason: z.string().optional(),
});
export type QuestionnaireAnswer = z.infer<typeof questionnaireAnswerSchema>;

export const questionnaireSchema = z.object({
  id: z.string(),
  videoId: z.string(),
  /** 這份問卷問的題目與目前的答案，依題庫順序；留白的題目 source 是 system */
  answers: z.array(questionnaireAnswerSchema),
  submittedAt: z.string().nullable(),
});
export type Questionnaire = z.infer<typeof questionnaireSchema>;

export const questionnaireResponseSchema = z.object({ questionnaire: questionnaireSchema.nullable() });

/** 送出問卷：每題的作答（來源由後端判斷） */
export const answerInputSchema = z.object({
  questionId: z.string(),
  choice: z.string().optional(),
  custom: z.string().max(MAX_ANSWER_LENGTH, `自己寫最多 ${MAX_ANSWER_LENGTH} 字`).optional(),
  photoIds: z.array(z.string()).optional(),
});
export type AnswerInput = z.infer<typeof answerInputSchema>;

export const submitQuestionnaireSchema = z.object({
  answers: z.array(answerInputSchema, { error: '問卷的資料不正確' }),
});
export type SubmitQuestionnaireInput = z.infer<typeof submitQuestionnaireSchema>;

export const submitQuestionnaireResponseSchema = z.object({
  questionnaire: questionnaireSchema,
  /** 這次送出是否寫入了系列問卷預設值（系列第一支送出問卷的影片） */
  seriesDefaultsSaved: z.boolean(),
});

/** 系列問卷預設值：每題的選項或自己寫（只有非每支影片不同的題目） */
export const questionnaireDefaultValueSchema = z.object({ choice: z.string().optional(), custom: z.string().optional() });
export const questionnaireDefaultsSchema = z.record(z.string(), questionnaireDefaultValueSchema);
export type QuestionnaireDefaults = z.infer<typeof questionnaireDefaultsSchema>;

/** Agent 的 generate_questionnaire 工具：挑題目並依創作輸入預填 */
export const agentPrefillSchema = z.object({
  questionId: z.enum(QUESTION_IDS),
  choice: z.string().optional(),
  custom: z.string().max(MAX_ANSWER_LENGTH).optional(),
});
export const generateQuestionnaireInputSchema = z.object({
  questionIds: z.array(z.enum(QUESTION_IDS)).min(1),
  prefill: z.array(agentPrefillSchema).default([]),
});
export type GenerateQuestionnaireInput = z.infer<typeof generateQuestionnaireInputSchema>;

export class QuestionnaireInputError extends Error {
  override name = 'QuestionnaireInputError';
  constructor(
    message: string,
    readonly questionId: string,
  ) {
    super(message);
  }
}

function present(text: string | undefined): text is string {
  return text !== undefined && text.trim().length > 0;
}

/** 選項題的選項要在題目的選項裡；文字題不能有選項 */
function validChoice(question: Question, choice: string | undefined): boolean {
  return choice !== undefined && question.kind === 'choice' && question.options.includes(choice);
}

/** 一個預填來源（選項或自己寫）轉成答案；不合用時回傳 null */
function prefillFrom(question: Question, value: { choice?: string | undefined; custom?: string | undefined }, source: AnswerSource) {
  if (validChoice(question, value.choice)) return { questionId: question.id, choice: value.choice, source } as QuestionnaireAnswer;
  if (question.kind !== 'photos' && present(value.custom)) return { questionId: question.id, custom: value.custom.trim(), source } as QuestionnaireAnswer;
  return null;
}

/**
 * 預填問卷（規格書「預填順序」）：本次的創作輸入（Agent 的預填）→ 系列問卷預設值 → 系列設定 → 留白由系統選擇。
 * - 只留 Agent 挑的題目，依題庫順序
 * - Agent 預填的選項不在題目的選項裡時不採用
 * - 每支影片不同的題目不使用系列問卷預設值
 * - 系列設定只有影片秒數對應「長度」
 */
export function prefillAnswers(input: {
  tool: GenerateQuestionnaireInput;
  seriesDefaults: QuestionnaireDefaults | null;
  series: { durationSec: number };
}): QuestionnaireAnswer[] {
  const asked = new Set<string>(input.tool.questionIds);
  return QUESTIONNAIRE_QUESTIONS.filter((q) => asked.has(q.id)).map((question): QuestionnaireAnswer => {
    const agent = input.tool.prefill.find((p) => p.questionId === question.id);
    const fromAgent = agent ? prefillFrom(question, agent, 'user') : null;
    if (fromAgent) return fromAgent;
    const fallback = input.seriesDefaults?.[question.id];
    const fromDefaults = !question.perVideo && fallback ? prefillFrom(question, fallback, 'series_default') : null;
    if (fromDefaults) return fromDefaults;
    if (question.id === 'length') {
      const fromSeries = prefillFrom(question, { choice: `${input.series.durationSec} 秒` }, 'series_default');
      if (fromSeries) return fromSeries;
    }
    return { questionId: question.id, source: 'system' };
  });
}

/** 兩個答案的內容是否相同（不看來源） */
function sameContent(a: QuestionnaireAnswer, b: QuestionnaireAnswer): boolean {
  return (
    a.choice === b.choice &&
    a.custom === b.custom &&
    JSON.stringify([...(a.photoIds ?? [])].sort()) === JSON.stringify([...(b.photoIds ?? [])].sort())
  );
}

/** 一題的作答整理成答案（不含來源）；不正確時丟出 QuestionnaireInputError */
function normalizeInput(question: Question, input: AnswerInput, videoPhotoIds: readonly string[]): Omit<QuestionnaireAnswer, 'source'> {
  const custom = present(input.custom) ? input.custom.trim() : undefined;
  if (input.choice !== undefined && custom !== undefined) throw new QuestionnaireInputError('選項和自己寫只能擇一', question.id);
  if (input.choice !== undefined && !validChoice(question, input.choice)) throw new QuestionnaireInputError('請從選項中選擇', question.id);
  if (question.kind === 'photos') {
    const photoIds = [...new Set(input.photoIds ?? [])];
    if (photoIds.some((id) => !videoPhotoIds.includes(id))) throw new QuestionnaireInputError('找不到這張照片', question.id);
    return photoIds.length > 0 ? { questionId: question.id, photoIds } : { questionId: question.id };
  }
  if (input.choice !== undefined) return { questionId: question.id, choice: input.choice };
  if (custom !== undefined) return { questionId: question.id, custom };
  return { questionId: question.id };
}

/**
 * 送出時整理答案：
 * - 題目不在這份問卷、選項不在這一題、選項和自己寫同時給、照片不是這支影片的：丟出 QuestionnaireInputError
 * - 和目前的答案相同時保留原本的來源；改過的是「你的輸入」；留白是「系統將會選擇」
 * - 沒有送的題目當成留白
 */
export function resolveSubmittedAnswers(
  current: readonly QuestionnaireAnswer[],
  input: readonly AnswerInput[],
  videoPhotoIds: readonly string[],
): QuestionnaireAnswer[] {
  const asked = new Set(current.map((a) => a.questionId));
  const byId = new Map<string, Omit<QuestionnaireAnswer, 'source'>>();
  for (const item of input) {
    const question = findQuestion(item.questionId);
    if (!question || !asked.has(item.questionId)) throw new QuestionnaireInputError('這份問卷沒有這一題', item.questionId);
    byId.set(item.questionId, normalizeInput(question, item, videoPhotoIds));
  }
  return current.map((original): QuestionnaireAnswer => {
    const answer = byId.get(original.questionId) ?? { questionId: original.questionId };
    const blank = answer.choice === undefined && answer.custom === undefined && (answer.photoIds ?? []).length === 0;
    if (blank) return { questionId: original.questionId, source: 'system' };
    const candidate: QuestionnaireAnswer = { ...answer, source: 'user' };
    return sameContent(candidate, original) ? { ...answer, source: original.source } : candidate;
  });
}

/** 寫入系列問卷預設值的內容：排除每支影片不同的題目與留白的題目 */
export function defaultsFromAnswers(answers: readonly QuestionnaireAnswer[]): QuestionnaireDefaults {
  const defaults: QuestionnaireDefaults = {};
  for (const answer of answers) {
    const question = findQuestion(answer.questionId);
    if (!question || question.perVideo) continue;
    if (answer.choice !== undefined) defaults[answer.questionId] = { choice: answer.choice };
    else if (answer.custom !== undefined) defaults[answer.questionId] = { custom: answer.custom };
  }
  return defaults;
}

/** 左欄的答案摘要：每題一行「題目：答案」；留白是「系統將會選擇」；照片寫張數 */
export function answerSummaryLines(answers: readonly QuestionnaireAnswer[]): string[] {
  return answers.map((answer) => {
    const title = findQuestion(answer.questionId)?.title ?? answer.questionId;
    const photos = answer.photoIds?.length ?? 0;
    const value = answer.choice ?? answer.custom ?? (photos > 0 ? `${photos} 張` : ANSWER_SOURCE_LABELS.system);
    return `${title}：${value}`;
  });
}
